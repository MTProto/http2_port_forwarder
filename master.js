'use strict'

//IRAN

const { readFile } =require('fs/promises');
const http = require('http');
const https = require('https');
const http2 = require('http2');
const net = require('net');
const tls = require('tls');
const fs = require('fs');
const bindPort = 443;
const downloadIP = '1.2.3.4';
const uploadIP = '5.6.7.8';
const targetIP = '9.10.11.12';
const crypto = require('crypto');
const EventEmitter = require('events');

async function readCertFiles(){
    let [key,cert,ca] = await Promise.all(['privkey','cert','chain']
                        .map(s=>`./cert/${s}1.pem`)
                        .map(r=>readFile(r)));
    return {key,cert,ca};
} 

const download = http2.createSecureServer({
        SNICallback(servername, callback){
            readCertFiles().then(r=>callback(null,tls.createSecureContext(r))).catch(console.log);
        },
        allowHTTP1: false
})

class StreamOverHTTP2 extends EventEmitter{
    constructor(session,server){
        super();
        this.session = session;
        this.stream = undefined;
        this.queue = {};
        this.once('_close',function(){this.emit('end')});
        let self = this;
        session.on('stream', function(stream, headers){
            console.log(headers)
            stream.on('error',function(err){self.emit('_close',err)})
            let id = headers['id'];
            if (id){
                let func = self.queue[id];
                if (!func){
                    stream.respond({':status': 500,'result': 'No such id'});
                    return stream.end();
                }
                delete self.queue[id];
                stream.respond({':status': 200,'result': 'ok'});
                func(stream);
                return
            }
            if (self.stream){
                stream.respond({':status': 500, result: 'unknown'});
                stream.end();
                return;
            }
            self.stream = stream;
            stream.respond({':status': 200, result:'idle'});
            //console.log(headers)
            stream.pause();
            
            stream.on('close',function(){self.emit('_close')})
            server.emit('duplex',self);
        });
        session.on('error',console.log);
        session.on('close',console.log);
        function ping(){
            if ((session.closed)||(session.destroyed))
                return false;
            session.ping(Buffer.from('abcdefgh'),function(err,duration,payload){
                setTimeout(ping,2000);
            })
            return true;
        }
        ping();
    }
    async get({host,port}){
        let self = this;
        let {stream} = self;
        if (!stream.pushAllowed)
            throw new Error('Push not allowed');
        let random = crypto.randomBytes(16).toString('hex');
        console.log('Pushing stream')
        stream.pushStream({ _host:host,_port:port,':method': 'GET',':path':'/ask',id:random },function(err, pushStream, headers){
            console.log('stream pushed',{err, headers})
            if (err)
                return reject(err);
            pushStream.respond({ ':status': 200 ,'content-type': 'text/html; charset=utf-8'});
            pushStream.end();
        })
        return new Promise(function(accept,reject){
            setTimeout(reject,5000,new Error('No reply'));
            self.queue[random] = accept;
        })
    }
}

download.on('session',function(session){
    let obj = new StreamOverHTTP2(session,download);
    console.log('New session')
})

let duplexes = new Set();

download.on('duplex',function(multi){
    duplexes.add(multi);
    multi.on('end',function(){
        duplexes.delete(multi);
        console.log('Multi ended')
    })
})

download.on('error', (err) => console.error(err));
download.on('secureConnection', (socket) => {
    socket.on('error', () => {});
  });

download.listen(bindPort,downloadIP);

function createSocket({host,port}){
    let d = Array.from(duplexes);
    if (d.length === 0)
        return Promise.reject(new Error('No persistent connection'));
    let multi = d[Math.floor(Math.random()*d.length)];
    return multi.get({host,port});
}

net.createServer(function(socket){
    console.log('A new connection...');
    socket.on('error',console.log);
    createSocket({host:targetIP,port:443}).then(function(remote){
        socket.pipe(remote).pipe(socket);
        socket.on('error',function(){remote.end()});
        remote.on('error',function(){socket.end()});
    }).catch(console.log)
}).listen(bindPort,uploadIP);


// createSocket({host:'speed.hetzner.de',port:443}).then(function(socket){
//         let server = https.get('https://speed.hetzner.de/100MB.bin',{socket},function(res){
//             let received = 0;
//             res.on('data',function(data){
//                 received+=data.length
//                 console.log(received)
//             })
//         })
//         server.on('error',console.log)
//         socket.on('error',console.log)
//     });
