/*jslint node: true */
'use strict';

var db = require('intervaluecore/db.js');
var units = require('./units');
var address = require('./address');

function start(data) {
	var ws = this;

	if (data.type === 'last') {
		units.getLastUnits(function(nodes, edges) {
			ws.emit('start', {
				nodes: nodes,
				edges: edges
			});
		});
	}
	else if (data.type === 'unit') {
		db.query("SELECT ROWID FROM units WHERE unit = ? LIMIT 0,1", [data.unit], function(row) {
			if (!row.length) {
				units.getLastUnits(function(nodes, edges) {
					ws.emit('start', {
						nodes: nodes,
						edges: edges,
						not_found: true
					});
				});
			}
			else {
				units.getUnitsBeforeRowid(row[0].rowid + 25, 100, function(nodes, edges) {
					ws.emit('start', {
						nodes: nodes,
						edges: edges
					});
				});
			}
		});
	}
	else if (data.type === 'address') {
		db.query("SELECT unit FROM unit_authors WHERE address = ? AND definition_chash IS NOT NULL \n\
		UNION \n\
		SELECT unit FROM inputs WHERE address = ? \n\
		UNION \n\
		SELECT unit FROM outputs WHERE address = ? LIMIT 0,1", [data.address, data.address, data.address], function(rows) {
			if(rows.length) {
				address.getAddressInfo(data.address, function(objTransactions, unspent, objBalance, end, definition, newLastInputsROWID, newLastOutputsROWID) {
					ws.emit('addressInfo', {
						address: data.address,
						objTransactions: objTransactions,
						unspent: unspent,
						objBalance: objBalance,
						end: end,
						definition: definition,
						newLastInputsROWID: newLastInputsROWID,
						newLastOutputsROWID: newLastOutputsROWID
					});
				});
			}else{
				ws.emit('addressInfo');
			}
		});
	}
}

function next(data) {
	var ws = this;

	units.getUnitsThatBecameStable(data.notStable, function(arrStableUnits) {
		units.getUnitsBeforeRowid(data.last, 100, function(nodes, edges) {
			ws.emit('next', {
				nodes: nodes,
				edges: edges,
				arrStableUnits: arrStableUnits
			});
		});
	});
}

function prev(data) {
	var ws = this;

	units.getUnitsThatBecameStable(data.notStable, function(arrStableUnits) {
		units.getUnitsAfterRowid(data.first, 100, function(nodes, edges) {
			ws.emit('prev', {
				nodes: nodes,
				edges: edges,
				end: nodes.length < 100,
				arrStableUnits: arrStableUnits
			});
		});
	});
}

function newUnits(data) {
	var ws = this;

	units.getUnitsThatBecameStable(data.notStable, function(arrStableUnits) {
		units.getUnitsAfterRowid(data.unit, 100, function(nodes, edges) {
			ws.emit('new', {
				nodes: nodes,
				edges: edges,
				arrStableUnits: arrStableUnits
			});
		});
	});
}


function info(data) {
	var ws = this;

	units.getInfoOnUnit(data.unit, function(objInfo) {
		if (objInfo) {
			ws.emit('info', objInfo);
		}
	});
}

function highlightNode(data) {
	var ws = this;

	db.query("SELECT ROWID FROM units WHERE unit = ? LIMIT 0,1", [data.unit], function(row) {
		if (row.length) {
			var rowid = row[0].rowid;
			if (rowid > data.first && rowid < data.first + 200) {
				units.getUnitsAfterRowid(data.first, 200, function(nodes, edges) {
					ws.emit('prev', {
						nodes: nodes,
						edges: edges,
						end: nodes.length < 100
					});
				});
			}
			else if (rowid < data.last && rowid > data.last - 200) {
				units.getUnitsBeforeRowid(data.last, 200, function(nodes, edges) {
					ws.emit('next', {
						nodes: nodes,
						edges: edges
					});
				});
			}
			else {
				units.getUnitsBeforeRowid(rowid + 25, 100, function(nodes, edges) {
					ws.emit('start', {
						nodes: nodes,
						edges: edges
					});
				});
			}
		}
		else {
			ws.emit('info');
		}
	});
}

function nextPageTransactions(data) {
	var ws = this;

	address.getAddressTransactions(data.address, data.lastInputsROWID, data.lastOutputsROWID, function(objTransactions, newLastInputsROWID, newLastOutputsROWID) {
		ws.emit('nextPageTransactions', {
			address: data.address,
			objTransactions: objTransactions,
			end: objTransactions === null || Object.keys(objTransactions).length < 5,
			newLastInputsROWID: newLastInputsROWID,
			newLastOutputsROWID: newLastOutputsROWID
		});
	});
}

exports.start = start;
exports.next = next;
exports.prev = prev;
exports.newUnits = newUnits;
exports.info = info;
exports.highlightNode = highlightNode;
exports.nextPageTransactions = nextPageTransactions;