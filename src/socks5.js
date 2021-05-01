var net = require('net')
var udp = require('dgram')

function socks5({ port, host, handleConnect, handleUdpAssociate, debug }, callback) {
    if (debug) log = console.log
    else log = () => {}

    if (!port) port = 1080
    if (!host) host = '::'
    var server = net.createServer(sock => {
        sock.once('data', handleAuth.bind(sock))
        sock.on('error', err => console.error(err))
    })
    server.start = () => server.listen(port, host, callback)
    server.on('error', callback)
    server.start()

    function handleAuth(data) {
        log('[CLIENT]: Version identifier/method selection message: ', data)
        var sock = this
        var version = data[0]
        if (!compareBytes(version, 0x05, sock)) return
        var nmethods = data[1]
        var methods = data.slice(2, nmethods + 2)
        handleMethods(methods, sock, () => {
            sock.once('data', handleRequest.bind(sock))
        })    
    }

    function handleRequest(data) {
        log('[CLIENT]: The socks request: ', data)
        var sock = this
        var version = data[0]
        if (!compareBytes(version, 0x05, sock)) return
        var rsv = data[2]
        if (!compareBytes(rsv, 0x00, sock)) return
        var atyp = data[3]
        var [ address, port, offset ] = handleAtyp(atyp, data, sock)
        if (!address || !port || !offset) return
        log('[CLIENT]: Destination: ' + address + ':' + port)
        var cmd = data[1]
        handleCmd(cmd, sock, data, address, port, offset)
    }

    function handleMethods(methods, sock, callback) {
        var buf
        var handlers = [
            {
                name: 'NO AUTHENTICATION REQUIRED',
                byte: 0x00,
                run: () => {
                    buf = Buffer.from([ 0x05, 0x00 ])
                    sock.write(buf)
                    callback()
                }
            }
        ]
        var handler = handlers.find(h => h.byte === methods.find(m => m === h.byte))
        if (handler) {
            handler.run()
        } else {
            buf = Buffer.from([ 0x05, 0xff ])
            sock.end(buf)
        }
        log('[SERVER]: Method selection message: ', buf)
    }

    function handleAtyp(atyp, data, tcpSocket, udpSocket) {
        var handlers = [
            {
                name: 'IP V4 address',
                byte: 0x01,
                run: () => {
                    var length = 0x04
                    var address = data.slice(4, length + 4).join('.') 
                    var port = data.slice(length + 4, length + 6)
                    port = port.length === 2 ? port.readUInt16BE() : ''
                    var offset = 4 + length + 2
                    return [ address, port, offset ]
                }
            },
            {
                name: 'DOMAINNAME',
                byte: 0x03,
                run: () => {
                    var length = data[4]
                    var address = data.slice(5, length + 5).toString('utf8')
                    var port = data.slice(length + 5, length + 7)
                    port = port.length === 2 ? port.readUInt16BE() : ''
                    var offset = 5 + length + 2
                    return [ address, port, offset ]
                }
            }/*,
            {
                name: 'IP V6 address',
                byte: 0x04,
                run: () => {
                    var length = 0x10
                    var address = data.slice(4, length + 4)
                    //We need to parse the address :/
                    var port = data.slice(length + 4, length + 6)
                    port = port.length === 2 ? port.readUInt16BE() : ''
                    var offset = 4 + length + 2
                    return [ address, port, offset ]
                }
            }*/
        ]
        var handler = handlers.find(h => h.byte === atyp)
        if (handler) {
            var [ address, port, offset ] = handler.run()
            if (!address || !port || !offset) {
                tcpSocket.end(Buffer.from([ 0x05, 0x01 ]))
                if (udpSocket) udpSocket.end()
            }
            return [ address, port, offset ]
        } else {
            tcpSocket.end(Buffer.from([ 0x05, 0x08 ]))
            if (udpSocket) udpSocket.close()
            return []
        }
    }

    function handleCmd(cmd, sock, data, address, port, offset) {
        var handlers = [
            {
                name: 'CONNECT',
                byte: 0x01,
                run: () => {
                    var accept = () => {
                        data[1] = 0x00
                        log('[SERVER]: Reply (Accepted): ', data)
                        sock.write(data)
                    }
                    var deny = () => {
                        var buf = Buffer.from([ 0x05, 0x02 ])
                        log('[SERVER]: Reply (Denied): ', buf)
                        sock.end(buf)
                    }
                    var info = {
                        dstAddress: address,
                        dstPort: port,
                        srcAddress: sock.remoteAddress,
                        srcPort: sock.remotePort
                    }
                    handleConnect(sock, accept, deny, info, data)
                }
            },
            {
                name: 'UDP ASSOCIATE',
                byte: 0x03,
                run: () => {
                    var socket = udp.createSocket('udp4')
                    socket.on('error', err => {
                        console.error('Error: ' + err)
                        socket.close()
                    })
                    socket.bind({
                        port: 0,
                        address: '0.0.0.0',
                        exclusive: true
                    }, () => {
                        data[1] = 0x00
                        var port = socket.address().port
                        data.writeUInt16BE(port, offset - 2)
                        log('[SERVER]: UDP server started: ', data)
                        log('[SERVER]: Address: ' + address + ':' + port)
                        sock.write(data)
                        socket.once('message', handleMsg)
                    })
                    function handleMsg(msg, rinfo) {
                        log('[CLIENT]: UDP associate client request: ', msg)
                        var rsv = msg.slice(0, 2)
                        if (!compareBytes(rsv, Buffer.from([ 0x00, 0x00 ]), sock, socket)) return
                        var frag = msg[2]
                        if (!compareBytes(frag, 0x00, sock, socket)) return
                        var atyp = msg[3]
                        var [ address, port, offset ] = handleAtyp(atyp, msg, sock, socket)
                        if (!address || !port || !offset) return
                        var accept = resp => {
                            var buf = Buffer.from([ ...msg.slice(0, offset), ...resp ])
                            log('[SERVER]: UDP associate server response (Accepted): ', buf)
                            socket.send(buf, rinfo.port, rinfo.address)
                        }
                        var deny = () => {
                            log('[SERVER]: UDP associate server response (Denied).')
                            socket.close()
                            sock.end()
                        }
                        var info = {
                            dstAddress: address,
                            dstPort: port,
                            srcAddress: rinfo.address,
                            srcPort: rinfo.port
                        }
                        handleUdpAssociate(msg.slice(offset), accept, deny, info)
                    }
                }
            }
        ]
        var handler = handlers.find(h => h.byte === cmd)
        if (handler) {
            return handler.run()
        } else {
            sock.end(Buffer.from([ 0x05, 0x07 ]))
        }
    }

    function compareBytes(a, b, tcpSocket, udpSocket) {
        var endConnection = () => {
            if (tcpSocket) tcpSocket.end()
            if (udpSocket) udpSocket.close()
        }
        if (typeof a === 'number' && typeof b === 'number') {
            if (a === b) return true
            else endConnection()
        } else if (a instanceof Buffer && b instanceof Buffer) {
            if (a.compare(b) === 0) return true
            else endConnection()
        } else endConnection()
    }

    return server
}

module.exports = socks5
