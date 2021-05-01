***
# **socks5.js**
[![npm](https://img.shields.io/npm/v/socks5.js?color=red)](https://www.npmjs.com/package/socks5.js)

SOCKS v5 proxy server implementation in JavaScript for Node.js.
***

## Table of Contents
-   [Features](#features)
-   [TODO](#todo)
-   [Installation](#installation)
-   [Usage](#usage)
-   [Resources](#resources)
-   [Notes](#notes)
-   [License](#license)

## Features
- CONNECT CMD.
- UDP Associate CMD.

## TODO
- IPv6 support.
- Authentication support.
- Better DOCS.

## Installation:

Install the library from **npm**:
```bash
$ npm install socks5.js --save
```

Then require it:
```js
const socks5 = require("socks5.js")
// or
import socks5 from "socks5.js"
```

## Usage:
### socks5(opts: object, callback: function)
The function `socks5` used to create a new SOCKS5 server, here is an example usage:
```js
var socks5 = require('socks5.js')
var net = require('net')
var udp = require('dgram')

var server = socks5({
    debug: true,
    port: 1080,
    host: '::',
    handleConnect: (sock, accept, deny, info) => {
        var socket = net.connect(info.dstPort, info.dstAddress)
        socket.on('connect', () => {
            accept()
            sock.pipe(socket)
            socket.pipe(sock)
        })
        socket.on('error', err => console.error(err))
    },
    handleUdpAssociate: (msg, accept, deny, info) => {
        var socket = udp.createSocket('udp4')
        socket.on('error', err => {
            console.error('Error: ' + err)
            socket.close()
        })
        socket.once('message', (msg, rinfo) => {
            accept(msg)
            socket.close()
        })
        socket.send(msg, info.dstPort, info.dstAddress)
    }
}, err => {
    if (!err) {
        var { address, port } = server.address()
        console.log(`SOCKS5 proxy server started on ${address}:${port}!`)
    } else {
        if (err.code === 'EADDRINUSE') {
            log('Address in use, retrying...')
            setTimeout(() => {
                server.close()
                server.start()
            }, 10000)
        }
    }
})
```

## Resources
- [SOCKS v5 spec (rfc1928)](https://www.ietf.org/rfc/rfc1928.txt).
- [@sansamour/node-socks library](https://github.com/sansamour/node-socks).
- [Using nodejs to implement Socks5 protocol - developpaper.com](https://developpaper.com/using-nodejs-to-implement-socks5-protocol).

## Notes
Give this cool project a star ⭐! I will appreciate it ❤

[![GitHub Repo stars](https://img.shields.io/github/stars/iMrDJAi/socks5.js?style=social)](https://github.com/iMrDJAi/socks5.js)

## License
[MIT](https://github.com/iMrDJAi/socks5.js/blob/master/LICENSE) © [iMrDJAi](https://github.com/iMrDJAi)
