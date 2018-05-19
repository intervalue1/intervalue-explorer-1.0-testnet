/*jslint node: true */
'use strict';

var db = require('intervaluecore/db.js');
var storage = require('intervaluecore/storage.js');
var moment = require('moment');
var async = require('async');

function getLastUnits(cb) {
	var nodes = [];
	var edges = {};

	db.query("SELECT parenthoods.child_unit, parenthoods.parent_unit, units.ROWID, units.is_on_main_chain, units.is_stable, units.best_parent_unit, units.sequence \n\
		FROM parenthoods, units WHERE parenthoods.child_unit IN \n\
		(SELECT unit FROM units ORDER BY ROWID DESC LIMIT 0, 100) and units.unit=parenthoods.child_unit ORDER BY parenthoods.ROWID DESC", function(rows) {
		rows.forEach(function(row) {
			nodes.push({
				data: {unit: row.child_unit, unit_s: row.child_unit.substr(0, 7) + '...'},
				rowid: row.rowid,
				is_on_main_chain: row.is_on_main_chain,
				is_stable: row.is_stable,
				sequence: row.sequence
			});
			edges[row.child_unit + '_' + row.parent_unit] = {
				data: {
					source: row.child_unit,
					target: row.parent_unit
				},
				best_parent_unit: row.parent_unit == row.best_parent_unit
			};
		});
		cb(nodes, edges);
	});
}

function getUnitsBeforeRowid(rowid, limit, cb) {
	var nodes = [];
	var edges = {};
	var units = [];

	db.query("SELECT ROWID, unit, is_on_main_chain, is_stable, sequence FROM units WHERE ROWID < ? ORDER BY ROWID DESC LIMIT 0, ?", [rowid, limit], function(rowsUnits) {
		rowsUnits.forEach(function(row) {
			nodes.push({
				data: {unit: row.unit, unit_s: row.unit.substr(0, 7) + '...'},
				rowid: row.rowid,
				is_on_main_chain: row.is_on_main_chain,
				is_stable: row.is_stable,
				sequence: row.sequence
			});
			units.push(row.unit);
		});
		if (units.length) {
			db.query("SELECT parenthoods.child_unit, parenthoods.parent_unit, units.ROWID, units.is_on_main_chain, units.is_stable, units.best_parent_unit \n\
		 FROM parenthoods, units WHERE \n\
		 (parenthoods.child_unit IN (?) OR parenthoods.parent_unit IN (?))  \n\
		 AND units.unit=parenthoods.child_unit ORDER BY parenthoods.ROWID DESC", [units, units], function(rows) {
				rows.forEach(function(row) {
					edges[row.child_unit + '_' + row.parent_unit] = {
						data: {
							source: row.child_unit,
							target: row.parent_unit
						},
						best_parent_unit: row.parent_unit == row.best_parent_unit
					};
				});
				cb(nodes, edges);
			});
		}
		else {
			cb([], []);
		}
	});
}

function getUnitsAfterRowid(rowid, limit, cb) {
	var nodes = [];
	var edges = {};
	var units = [];

	db.query("SELECT ROWID, unit, is_on_main_chain, is_stable, sequence FROM units WHERE ROWID > ? ORDER BY ROWID ASC LIMIT 0, ?", [rowid, limit], function(rowsUnits) {
		rowsUnits.forEach(function(row) {
			nodes.push({
				data: {unit: row.unit, unit_s: row.unit.substr(0, 7) + '...'},
				rowid: row.rowid,
				is_on_main_chain: row.is_on_main_chain,
				is_stable: row.is_stable,
				sequence: row.sequence
			});
			units.push(row.unit);
		});
		nodes = nodes.sort(function(a, b) {
			if (a.rowid < b.rowid) {
				return 1;
			}
			if (a.rowid > b.rowid) {
				return -1;
			}
			return 0;
		});

		if (units.length) {

			db.query("SELECT parenthoods.child_unit, parenthoods.parent_unit, units.ROWID, units.is_on_main_chain, units.is_stable, units.best_parent_unit \n\
		 FROM parenthoods, units WHERE \n\
		 (parenthoods.child_unit IN (?) OR parenthoods.parent_unit IN (?))  \n\
		 AND units.unit=parenthoods.child_unit ORDER BY parenthoods.ROWID DESC", [units, units], function(rows) {
				rows.forEach(function(row) {
					edges[row.child_unit + '_' + row.parent_unit] = {
						data: {
							source: row.child_unit,
							target: row.parent_unit
						},
						best_parent_unit: row.parent_unit == row.best_parent_unit
					};
				});
				cb(nodes, edges);
			});
		}
		else {
			cb([], []);
		}
	});
}

function getParentsAndChildren(unit, cb) {
	var parents = [];
	var children = [];
	db.query(
		"SELECT child_unit, parent_unit \n\
		FROM parenthoods \n\
		WHERE child_unit = ? or parent_unit = ? \n\
		ORDER BY parent_unit",
		[unit, unit],
		function(rows) {
			rows.forEach(function(row) {
				if (row.child_unit === unit) {
					parents.push(row.parent_unit);
				}
				else {
					children.push(row.child_unit);
				}
			});
			cb({parents: parents, children: children});
		}
	);
}

function getTransfersInfo(unit, cb) {
	var transfersInfo = {};
	db.query("SELECT outputs.output_index, outputs.unit, outputs.amount, outputs.asset FROM inputs, outputs \n\
		WHERE inputs.unit = ? AND inputs.type = 'transfer' AND outputs.output_index = inputs.src_output_index \n\
		AND outputs.unit = inputs.src_unit AND outputs.message_index = inputs.src_message_index", [unit], function(rows) {
		rows.forEach(function(row) {
			transfersInfo[row.unit + '_' + row.output_index + '_' + row.asset] = {unit: row.unit, amount: row.amount};
		});
		cb(transfersInfo);
	});
}


function getSpentOutputs(unit, cb) {
	var spentOutputs = {};
	db.query("SELECT outputs.output_id, inputs.unit FROM outputs, inputs \n\
		WHERE outputs.unit = ? AND is_spent = 1 AND inputs.src_unit = outputs.unit AND inputs.src_message_index = outputs.message_index \n\
		AND inputs.src_output_index = outputs.output_index", [unit], function(rows) {
		rows.forEach(function(row) {
			spentOutputs[row.output_id] = row.unit;
		});
		cb(spentOutputs);
	});
}

function getUnitOutputs(unit, cb) {
	var unitOutputs = {};
	getSpentOutputs(unit, function(outputsSpent) {
		db.query("SELECT output_id, address, amount, asset, denomination, is_spent FROM outputs WHERE unit = ? ORDER BY output_index", [unit], function(rows) {
			rows.forEach(function(row) {
				if (!unitOutputs[row.asset]) unitOutputs[row.asset] = [];

				if (outputsSpent[row.output_id]) {
					row.spent = outputsSpent[row.output_id];
				}
				else {
					row.spent = false;
				}

				unitOutputs[row.asset].push(row);
			});
			cb(unitOutputs);
		});
	});
}
function getUnitCommissions(unit, cb) {
	var assocCommissions = {headers: {}, witnessing: {}};
	db.query("SELECT type, address, from_main_chain_index, to_main_chain_index FROM inputs WHERE unit = ? AND (type = 'headers_commission' OR type = 'witnessing')", [unit], function(rows) {
		if (rows.length) {
			async.each(rows, function(row, callback) {
				var tableName, objectName;
				if (row.type === 'headers_commission') {
					tableName = 'headers_commission_outputs';
					objectName = 'headers';
				} else if (row.type === 'witnessing') {
					tableName = 'witnessing_outputs';
					objectName = 'witnessing';
				}
				if (tableName) {
					db.query("SELECT SUM(amount) AS sum FROM " + tableName + " WHERE address = ? AND main_chain_index >= ? AND main_chain_index <= ? ORDER BY main_chain_index",
						[row.address, row.from_main_chain_index, row.to_main_chain_index],
						function(rowsCommissionOutputs) {
							assocCommissions[objectName][row.from_main_chain_index + '_' + row.to_main_chain_index] = {
								address: row.address,
								from_mci: row.from_main_chain_index,
								to_mci: row.to_main_chain_index,
								sum: rowsCommissionOutputs[0].sum
							};
							callback();
						});
				} else {
					callback();
				}
			}, function() {
				cb(assocCommissions);
			});
		} else {
			cb(assocCommissions);
		}
	});
}

function setDefinitionInAuthors(unit, objJoint, cb) {
	async.eachOf(objJoint.unit.authors, function(value, key, callback) {
		db.query("SELECT * FROM unit_authors WHERE unit = ? AND address = ? AND definition_chash IS NOT NULL", [unit, value.address], function(rowUnitAuthors) {
			if (rowUnitAuthors.length) {
				db.query("SELECT * FROM definitions WHERE definition_chash = ?", [rowUnitAuthors[0].definition_chash], function(rowDefinitions) {
					if (rowDefinitions) {
						objJoint.unit.authors[key].definition = rowDefinitions[0].definition;
					} else {
						objJoint.unit.authors[key].definition = false;
					}
					callback();
				});
			} else {
				objJoint.unit.authors[key].definition = false;
				callback();
			}
		});
	}, function() {
		cb(objJoint)
	});
}

function getUnitSequence(unit, cb) {
	db.query('SELECT sequence FROM units WHERE unit = ?', [unit], function(rows) {
		cb(rows[0].sequence);
	});
}

function getInfoOnUnit(unit, cb) {
	storage.readUnitProps(db, unit, function(unitProps) {
		storage.readJoint(db, unit, {
			ifFound: function(objJoint) {
				getParentsAndChildren(unit, function(objParentsAndChildren) {
					getTransfersInfo(unit, function(transfersInfo) {
						getUnitOutputs(unit, function(unitOutputs) {
							getUnitCommissions(unit, function(assocCommissions) {
								setDefinitionInAuthors(unit, objJoint, function(objJoint) {
									getUnitSequence(unit, function(sequence) {
										var objInfo = {
											unit: unit,
											sequence: sequence,
											child: objParentsAndChildren.children,
											parents: objParentsAndChildren.parents,
											authors: objJoint.unit.authors,
											headers_commission: objJoint.unit.headers_commission,
											payload_commission: objJoint.unit.payload_commission,
											main_chain_index: unitProps.main_chain_index,
											latest_included_mc_index: unitProps.latest_included_mc_index,
											level: unitProps.level,
											witnessed_level: unitProps.witnessed_level,
											is_stable: unitProps.is_stable,
											last_ball_unit: objJoint.unit.last_ball_unit,
											messages: objJoint.unit.messages,
											transfersInfo: transfersInfo,
											outputsUnit: unitOutputs,
											date: moment(objJoint.unit.timestamp * 1000).format(),
											assocCommissions: assocCommissions
										};
										if (objJoint.unit.witnesses) {
											objInfo.witnesses = objJoint.unit.witnesses;
											cb(objInfo);
										}
										else {
											storage.readWitnesses(db, unit, function(arrWitnesses) {
												objInfo.witnesses = arrWitnesses;
												cb(objInfo);
											});
										}
									});
								});
							});
						});
					});
				});
			},
			ifNotFound: function() {
				cb(null);
			}
		});
	});
}


function getUnitsThatBecameStable(arrUnits, cb) {
	if (!arrUnits.length) return cb([]);
	db.query("SELECT unit, is_on_main_chain, is_stable FROM units WHERE unit IN (?) and is_stable = 1", [arrUnits], function(rows) {
		cb(rows);
	});
}

exports.getLastUnits = getLastUnits;
exports.getUnitsBeforeRowid = getUnitsBeforeRowid;
exports.getUnitsAfterRowid = getUnitsAfterRowid;
exports.getInfoOnUnit = getInfoOnUnit;
exports.getUnitsThatBecameStable = getUnitsThatBecameStable;