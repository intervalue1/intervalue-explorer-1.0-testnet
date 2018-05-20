/*jslint node: true */
"use strict";
var conf = require('intervaluecore-1.0-testnet/conf.js');
var myWitnesses = require('intervaluecore-1.0-testnet/my_witnesses.js');


function replaceConsoleLog () {
	var clog = console.log;
	console.log = function () {
		Array.prototype.unshift.call(arguments, Date().toString() + ':');
		clog.apply(null, arguments);
	}
}

function start () {
	console.log('starting');
	var network = require('intervaluecore-1.0-testnet/network.js');
	if (conf.initial_peers)
		conf.initial_peers.forEach(function (url) {
			network.findOutboundPeerOrConnect(url);
		});
}

replaceConsoleLog();
myWitnesses.readMyWitnesses(function (arrWitnesses) {
	if (arrWitnesses.length > 0)
		return start();
	console.log('will init witnesses', conf.initial_witnesses);
	myWitnesses.insertWitnesses(conf.initial_witnesses, start);
}, 'ignore');
