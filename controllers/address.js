/*jslint node: true */
'use strict';

var db = require('intervaluecore-1.0-testnet/db.js');
var moment = require('moment');
var async = require('async');
var BIGINT = 9223372036854775807;

function getAmountForInfoAddress(objTransactions, cb) {
	var arrTransactionsUnit = [], key;
	for (key in objTransactions) {
		if (arrTransactionsUnit.indexOf(objTransactions[key].unit) == -1) arrTransactionsUnit.push(objTransactions[key].unit);
	}
	db.query("SELECT inputs.unit, outputs.address, outputs.amount, outputs.asset FROM inputs, outputs \n\
		WHERE inputs.unit IN (?) AND outputs.unit = inputs.src_unit AND outputs.message_index = inputs.src_message_index AND outputs.output_index = inputs.src_output_index",
		[arrTransactionsUnit], function(rowsAmount) {
			db.query("SELECT unit, asset, type, serial_number, from_main_chain_index, to_main_chain_index, amount, address \n\
				FROM inputs WHERE unit IN (?) AND (type='issue' OR type='headers_commission' OR type='witnessing')", [arrTransactionsUnit], function(rows) {
				rowsAmount.forEach(function(row) {
					key = row.unit + '_' + row.asset;
					if (objTransactions[key]) objTransactions[key].from.push({
						address: row.address,
						amount: row.amount
					});
				});
				async.each(rows, function(row, callback) {
					if (row.type === 'issue') {
						key = row.unit + '_' + row.asset;
						if (objTransactions[key]) objTransactions[key].from.push({
							issue: true,
							amount: row.amount,
							serial_number: row.serial_number,
							address: row.address
						});
						callback();
					} else {
						var tableName, commissionType;
						if (row.type === 'headers_commission') {
							tableName = 'headers_commission_outputs';
							commissionType = 'headers';
						} else if (row.type === 'witnessing') {
							tableName = 'witnessing_outputs';
							commissionType = 'witnessing';
						}
						if (tableName) {
							db.query("SELECT SUM(amount) AS sum FROM " + tableName + " WHERE address = ? AND main_chain_index >= ? AND main_chain_index <= ? ORDER BY main_chain_index",
								[row.address, row.from_main_chain_index, row.to_main_chain_index],
								function(rowsCommissionOutputs) {
									key = row.unit + '_' + row.asset;
									if (objTransactions[key]) objTransactions[key].from.push({
										commissionType: commissionType,
										address: row.address,
										from_mci: row.from_main_chain_index,
										to_mci: row.to_main_chain_index,
										sum: rowsCommissionOutputs[0].sum
									});
									callback();
								});
						} else {
							callback();
						}
					}
				}, function() {
					cb(objTransactions);
				});
			})
		});
}

function getSpentOutputs(objTransactions, cb) {
	var arrTransactionsUnit = [], key, key2;
	for (key in objTransactions) {
		if (arrTransactionsUnit.indexOf(objTransactions[key].unit) == -1) arrTransactionsUnit.push(objTransactions[key].unit);
	}
	var n = 0, l = arrTransactionsUnit.length - 1;

	function setSpentOutputs() {
		db.query("SELECT outputs.output_id, outputs.message_index, outputs.output_index, outputs.asset, inputs.unit \n \
		FROM outputs, inputs WHERE outputs.unit = ? AND is_spent = 1 AND inputs.src_unit = outputs.unit \n\
		AND inputs.src_message_index = outputs.message_index AND inputs.src_output_index = outputs.output_index",
			[arrTransactionsUnit[n]], function(rows) {
				rows.forEach(function(row) {
					key = arrTransactionsUnit[n] + '_' + row.asset;
					key2 = row.output_id + '_' + row.message_index + '_' + row.output_index;
					if (objTransactions[key] && objTransactions[key].to[key2]) {
						objTransactions[key].to[key2].spent = row.unit;
					}
				});
				if (n < l) {
					n++;
					setSpentOutputs();
				}
				else {
					cb(objTransactions);
				}
			});
	}

	setSpentOutputs();
}

function getUnitsForTransactionsAddress(address, lastInputsROWID, lastOutputsROWID, cb) {
	db.query("SELECT inputs.unit, MIN(inputs.ROWID) AS inputsROWID, MIN(outputs.ROWID) AS outputsROWID \n\
		FROM inputs, outputs, units \n\
		WHERE (( inputs.unit IN (SELECT unit FROM inputs WHERE address = ? AND ROWID < ? GROUP BY unit ORDER BY ROWID DESC LIMIT 0, 5)) \n\
		OR ( outputs.unit IN (SELECT unit FROM outputs WHERE address = ? AND ROWID < ? GROUP BY unit ORDER BY ROWID DESC LIMIT 0, 5))) \n\
		AND inputs.unit = outputs.unit AND (( inputs.asset IS NULL AND outputs.asset IS NULL ) OR (inputs.asset = outputs.asset)) \n\
		AND units.unit = inputs.unit \n\
		GROUP BY inputs.unit \n\
		ORDER BY units.ROWID DESC LIMIT 0, 5", [address, lastInputsROWID, address, lastOutputsROWID], function(rows) {
		var lastRow = rows[rows.length - 1] || {};
		cb(rows.map(function(row) {
			return row.unit;
		}), lastRow.inputsROWID, lastRow.outputsROWID);
	});
}

function getAddressTransactions(address, lastInputsROWID, lastOutputsROWID, cb) {
	getUnitsForTransactionsAddress(address, lastInputsROWID, lastOutputsROWID, function(arrUnit, newLastInputsROWID, newLastOutputsROWID) {
		if (arrUnit.length) {
			db.query("SELECT inputs.unit, units.creation_date, inputs.address, outputs.address AS addressTo, outputs.amount, inputs.asset, outputs.asset AS assetTo, outputs.output_id, outputs.message_index, outputs.output_index, inputs.type, "+ db.getUnixTimestamp("units.creation_date")+" AS timestamp \n\
		FROM inputs, outputs, units \n\
		WHERE (( inputs.unit IN (?) AND outputs.unit = inputs.unit ) OR ( outputs.unit IN (?) AND inputs.unit = outputs.unit )) \n\
		AND (( inputs.asset IS NULL AND outputs.asset IS NULL ) OR (inputs.asset = outputs.asset)) \n\
		AND units.unit = inputs.unit \n\
		ORDER BY units.main_chain_index DESC",
				[arrUnit, arrUnit], function(rowsTransactions) {
					var key, objTransactions = {};
					if (rowsTransactions.length) {
						rowsTransactions.forEach(function(row) {
							key = row.unit + '_' + row.asset;
							if (!objTransactions[key]) objTransactions[key] = {
								unit: row.unit,
								date: moment(row.timestamp * 1000).format(),
								from: [],
								to: {},
								spent: false,
								asset: row.asset,
								output_id: row.output_id
							};
							if (objTransactions[key].from.indexOf(row.address) === -1) objTransactions[key].from.push(row.address);
							if (!objTransactions[key].to[row.output_id + '_' + row.message_index + '_' + row.output_index]) {
								objTransactions[key].to[row.output_id + '_' + row.message_index + '_' + row.output_index] = {
									address: row.addressTo,
									amount: row.amount,
									spent: 0
								};
							}
						});

						for (var key in objTransactions) {
							if (objTransactions[key].from.indexOf(address) !== -1) {
								objTransactions[key].spent = true;
							}
							objTransactions[key].from = [];
						}

						getAmountForInfoAddress(objTransactions, function(objTransactions) {
							getSpentOutputs(objTransactions, function(objTransactions) {
								cb(objTransactions, newLastInputsROWID, newLastOutputsROWID);
							});
						});
					}
					else {
						cb(null);
					}
				}
			);
		}
		else {
			cb(null);
		}
	});
}

function getAddressInfo(address, cb) {
	getAddressTransactions(address, BIGINT, BIGINT, function(objTransactions, newLastInputsROWID, newLastOutputsROWID) {
		db.query("SELECT * FROM outputs WHERE address=? and is_spent=0 ORDER BY output_id DESC", [address], function(rowsOutputs) {
			if (objTransactions !== null || rowsOutputs.length) {
				var objBalance = {bytes: 0}, unspent = [];
				rowsOutputs.forEach(function(row) {
					unspent.push(row);
					if (row.asset === null) {
						objBalance.bytes += row.amount;
					}
					else {
						if (!objBalance[row.asset]) objBalance[row.asset] = 0;
						objBalance[row.asset] += row.amount;
					}
				});
			}
			db.query("SELECT * FROM unit_authors WHERE address = ? AND definition_chash IS NOT NULL ORDER BY ROWID DESC LIMIT 0,1", [address], function(rowsUnitAuthors) {
				var end = objTransactions ? Object.keys(objTransactions).length < 5 : null;
				if (rowsUnitAuthors.length) {
					db.query("SELECT * FROM definitions WHERE definition_chash = ?", [rowsUnitAuthors[0].definition_chash], function(rowsDefinitions) {
						if (rowsDefinitions) {
							cb(objTransactions, unspent, objBalance, end, rowsDefinitions[0].definition, newLastInputsROWID, newLastOutputsROWID);
						} else {
							cb(objTransactions, unspent, objBalance, end, false, newLastInputsROWID, newLastOutputsROWID);
						}
					});
				} else {
					cb(objTransactions, unspent, objBalance, end, false, newLastInputsROWID, newLastOutputsROWID);
				}
			});
		});
	});
}


exports.getAddressInfo = getAddressInfo;
exports.getAddressTransactions = getAddressTransactions;