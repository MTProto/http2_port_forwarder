'use strict'

//FRANCE

const http2 = require('http2');
const net = require('net');
const slaveGate = 'https://slaveGate.com';
let gateways = new Set();

net.Socket.prototype.safeTimeout = function(){
    this.setKeepAlive(true,60000);
    this.on('timeout',function(){
        this.emit('error',new Error('Timeout occured'));
        this.destroy()
    });
    this.setTimeout(300000);
}

for (let i=0;i<40;i++){
	createGateway();
}

function createGateway(){
	let client = http2.connect(slaveGate,{rejectUnauthorized:false})
	client.socket.safeTimeout();
	client.on('connect',function(session){
		console.log('client connected')
		let req = session.request({':path': '/initial'});
		req.on('response',function(headers,flags){});
		req.on('error',console.log)
	})

	client.on('error',function(err){
		this.emit('close');
		console.log(err);
	})

	client.on('stream', function(pushedStream, requestHeaders) {
		pushedStream.end();
		let p = requestHeaders[':path'];
		if (p!==('/ask'))
			return
		let {_host,_port,id} = requestHeaders
		let [host,port] = [_host,_port]
		if (!id){
			return
		}
		let req =client.request({':method':'CONNECT',':authority':'www.yahoo.com:443', id});
		let remote = net.createConnection({host,port},function(){
			gateways.add(client);
			remote.pipe(req);
			req.pipe(remote);
		})
		req.pause();
		req.on('response',function(headers,flags){
			console.log({headers,flags});
		})
		req.on('error',function(err){remote.end()});
		remote.on('error',function(err){req.end()});
	});
	client.once('close',function(){
		gateways.delete(client);
		setTimeout(createGateway,1000);
	});
}
