var _cy;
var nodes, edges;
var firstUnit, lastUnit, phantoms = {}, phantomsTop = {}, notStable = [];
var nextPositionUpdates;
var generateOffset = 0, newOffset = -116, oldOffset;
var activeNode, waitGo;
var notLastUnitUp = false, notLastUnitDown = true;
var lastActiveUnit;
var page, isInit = false;
var queueAnimationPanUp = [], animationPlaysPanUp = false;

function init(_nodes, _edges) {
	nodes = _nodes;
	edges = _edges;
	firstUnit = nodes[0].rowid;
	lastUnit = nodes[nodes.length - 1].rowid;
	phantoms = {};
	phantomsTop = {};
	notStable = [];
	nextPositionUpdates = null;
	generateOffset = 0;
	newOffset = -116;
	notLastUnitUp = false;
	notLastUnitDown = true;
	activeNode = null;
	waitGo = null;
	createCy();
	generate(_nodes, _edges);
	oldOffset = _cy.getElementById(nodes[0].data.unit).position().y + 66;
	_cy.viewport({zoom: 1.01});
	_cy.center(_cy.nodes()[0]);
	page = 'dag';

	if (location.hash && location.hash.length == 45) {
		notLastUnitUp = true;
		highlightNode(location.hash.substr(1));
	}
	isInit = true;
}

function start() {
	if (!location.hash || (location.hash.length != 45 && location.hash.length != 33)) {
		socket.emit('start', {type: 'last'});
	}
	else if (location.hash.length == 45) {
		socket.emit('start', {type: 'unit', unit: location.hash.substr(1)});
		notLastUnitUp = true;
	}
	else if (location.hash.length == 33) {
		socket.emit('start', {type: 'address', address: location.hash.substr(1)});
		$('#addressInfo').show();
	}
}

function createCy() {
	_cy = cytoscape({
		container: document.getElementById('cy'),
		boxSelectionEnabled: false,
		autounselectify: true,
		hideEdgesOnViewport: false,
		layout: {
			name: 'preset'
		},
		style: [
			{
				selector: 'node',
				style: {
					'content': 'data(unit_s)',
					'text-opacity': 1,
					'min-zoomed-font-size': 13,
					'text-valign': 'bottom',
					'text-halign': 'center',
					'font-size': '13px',
					'text-margin-y': '5px',
					'background-color': '#fff',
					'border-width': 1,
					'border-color': '#2980b9',
					//	'border-color': '#333',
					//	'border-style': 'dotted',
					'width': 25,
					'height': 25
				}
			},
			{
				selector: 'node.hover',
				style: {
					'content': 'data(id)',
					'text-opacity': 1,
					'font-weight': 'bold',
					'font-size': '14px',
					'text-background-color': '#fff',
					'text-background-opacity': 1,
					'text-background-shape': 'rectangle',
					'text-border-opacity': 1,
					'text-border-width': 4,
					'text-border-color': '#fff',
					'z-index': 9999
				}
			},
			{
				selector: 'edge',
				style: {
					'width': 2,
					'target-arrow-shape': 'triangle',
					'line-color': '#2980b9',
					'target-arrow-color': '#2980b9',
					'curve-style': 'bezier'
				}
			},
			{
				selector: '.best_parent_unit',
				style: {
					'width': 5,
					'target-arrow-shape': 'triangle',
					'line-color': '#2980b9',
					'target-arrow-color': '#2980b9',
					'curve-style': 'bezier'
				}
			},
			{
				selector: '.is_on_main_chain',
				style: {
					//	'border-width': 4,
					//	'border-style': 'solid',
					//	'border-color': '#2980b9'
					//	'border-color': '#333'
					'background-color': '#9cc0da'
				}
			},
			{
				selector: '.is_stable',
				style: {
					//	'background-color': '#2980b9'
					'border-width': 4,
					'border-style': 'solid',
					'border-color': '#2980b9',
					//	'background-color': '#9cc0da'
				}
			},
			{
				selector: '.active',
				style: {
					//	'background-color': '#2980b9',
					'border-color': '#333',
					'border-width': '4'
				}
			},
			{
				selector: '.finalBad',
				style: {
					'background-color': 'red'
				}
			},
			{
				selector: '.tempBad',
				style: {
					'background-color': 'red'
				}
			}
		],
		elements: {
			nodes: [],
			edges: []
		}
	});

	_cy.on('mouseover', 'node', function() {
		this.addClass('hover');
	});

	_cy.on('mouseout', 'node', function() {
		this.removeClass('hover');
	});

	_cy.on('click', 'node', function(evt) {
		location.hash = '#' + evt.cyTarget.id();
	});

	_cy.on('tap', 'node', function(evt) {
		location.hash = '#' + evt.cyTarget.id();
	});

	_cy.on('pan', function() {
		var ext = _cy.extent();
		if (nextPositionUpdates < ext.y2) {
			getNext();
		}
		else if (notLastUnitUp === true && ext.y2 - (ext.h) < _cy.getElementById(nodes[0].data.unit).position().y) {
			getPrev();
		}
		scroll.scrollTop(convertPosPanToPosScroll());
	});

	$(_cy.container()).on('wheel mousewheel', function(e) {
		var deltaY = e.originalEvent.wheelDeltaY || -e.originalEvent.deltaY;
		if (page == 'dag') {
			e.preventDefault();
			if (deltaY > 0) {
				scrollUp();
			}
			else if (deltaY < 0) {
				_cy.panBy({x: 0, y: -25});
			}
			scroll.scrollTop(convertPosPanToPosScroll());
		}
	});
}

function updListNotStableUnit() {
	if (!_cy) return;
	notStable = [];
	_cy.nodes().forEach(function(node) {
		if (!node.hasClass('is_stable')) {
			notStable.push(node.id());
		}
	});
}

function generate(_nodes, _edges) {
	var newOffset_x, newOffset_y, left = Infinity, right = -Infinity, first = false, generateAdd = [], _node,
		classes = '', pos_iomc;
	var graph = createGraph(_nodes, _edges);
	graph.nodes().forEach(function(unit) {
		_node = graph.node(unit);
		if (_node) {
			if (_node.x < left) left = _node.x;
			if (_node.x > right) right = _node.x;
		}
	});
	graph.nodes().forEach(function(unit) {
		_node = graph.node(unit);
		if (_node) {
			classes = '';
			if (_node.is_on_main_chain) classes += 'is_on_main_chain ';
			if (_node.is_stable) classes += 'is_stable ';
			if (_node.sequence === 'final-bad') classes += 'finalBad';
			if (_node.sequence === 'temp-bad') classes += 'tempBad';
			if (!first) {
				newOffset_x = -_node.x - ((right - left) / 2);
				newOffset_y = generateOffset - _node.y + 66;
				first = true;
			}
			if (phantoms[unit] !== undefined) {
				_cy.remove(_cy.getElementById(unit));
				generateAdd.push({
					group: "nodes",
					data: {id: unit, unit_s: _node.label},
					position: {x: phantoms[unit], y: _node.y + newOffset_y},
					classes: classes
				});
				delete phantoms[unit];
			}
			else {
				pos_iomc = setMaxWidthNodes(_node.x + newOffset_x);
				if (pos_iomc == 0 && _node.is_on_main_chain == 0) {
					pos_iomc += 40;
				}
				generateAdd.push({
					group: "nodes",
					data: {id: unit, unit_s: _node.label},
					position: {x: pos_iomc, y: _node.y + newOffset_y},
					classes: classes
				});
			}
		}
	});
	generateAdd = fixConflicts(generateAdd);
	_cy.add(generateAdd);
	generateOffset = _cy.nodes()[_cy.nodes().length - 1].position().y;
	nextPositionUpdates = generateOffset;
	_cy.add(createEdges());
	updListNotStableUnit();
	updateScrollHeigth();
}


function animationPanUp(distance) {
	if (animationPlaysPanUp) {
		queueAnimationPanUp.push(distance);
	}
	else {
		if (queueAnimationPanUp.length > 1) {
			distance = queueAnimationPanUp.reduce(function(prev, current) {
				return prev + current;
			});
			queueAnimationPanUp = [];
		}
		_cy.stop();
		animationPlaysPanUp = true;
		_cy.animate({
			pan: {
				x: _cy.pan('x'),
				y: _cy.pan('y') + distance
			}
		}, {
			duration: 250,
			complete: function() {
				oldOffset = _cy.getElementById(nodes[0].data.unit).position().y + 66;
				animationPlaysPanUp = false;
				if (queueAnimationPanUp.length) {
					animationPanUp(queueAnimationPanUp[0]);
					queueAnimationPanUp.splice(0, 1);
				}
			}
		});
	}
}

function setNew(_nodes, _edges, newUnits) {
	var newOffset_x, newOffset_y, min = Infinity, max = -Infinity, left = Infinity, right = -Infinity, first = false, x,
		y, generateAdd = [], _node, classes = '', pos_iomc;
	var graph = createGraph(_nodes, _edges);
	graph.nodes().forEach(function(unit) {
		_node = graph.node(unit);
		if (_node) {
			y = _node.y;
			if (y < min) min = y;
			if (y > max) max = y;
			if (_node.x < left) left = _node.x;
			if (_node.x > right) right = _node.x;
		}
	});
	graph.nodes().forEach(function(unit) {
		_node = graph.node(unit);
		if (_node) {
			classes = '';
			if (_node.is_on_main_chain) classes += 'is_on_main_chain ';
			if (_node.is_stable) classes += 'is_stable ';
			if (_node.sequence === 'final-bad') classes += 'finalBad';
			if (_node.sequence === 'temp-bad') classes += 'tempBad';
			if (!first) {
				newOffset_x = -_node.x - ((right - left) / 2);
				newOffset_y = newOffset - (max - min) + 66;
				newOffset -= (max - min) + 66;
				first = true;
				if (newUnits && _cy.extent().y1 < oldOffset) {
					animationPanUp(max + 54);
				}
			}
			if (phantomsTop[unit] !== undefined) {
				_cy.remove(_cy.getElementById(unit));
				generateAdd.push({
					group: "nodes",
					data: {id: unit, unit_s: _node.label},
					position: {x: phantomsTop[unit], y: _node.y + newOffset_y},
					classes: classes
				});
				delete phantomsTop[unit];
			} else {
				pos_iomc = setMaxWidthNodes(_node.x + newOffset_x);
				if (pos_iomc == 0 && _node.is_on_main_chain == 0) {
					pos_iomc += 40;
				}
				generateAdd.push({
					group: "nodes",
					data: {id: unit, unit_s: _node.label},
					position: {x: pos_iomc, y: _node.y + newOffset_y},
					classes: classes
				});
			}
		}
	});
	generateAdd = fixConflicts(generateAdd);
	_cy.add(generateAdd);
	_cy.add(createEdges());
	updListNotStableUnit();
	updateScrollHeigth();
}

function createGraph(_nodes, _edges) {
	var graph = new dagre.graphlib.Graph({
		multigraph: true,
		compound: true
	});
	graph.setGraph({});
	graph.setDefaultEdgeLabel(function() {
		return {};
	});
	_nodes.forEach(function(node) {
		graph.setNode(node.data.unit, {
			label: node.data.unit_s,
			width: 32,
			height: 32,
			is_on_main_chain: node.is_on_main_chain,
			is_stable: node.is_stable,
			sequence: node.sequence
		});
	});
	for (var k in _edges) {
		if (_edges.hasOwnProperty(k)) {
			graph.setEdge(_edges[k].data.source, _edges[k].data.target);
		}
	}
	dagre.layout(graph);
	return graph;
}

function setMaxWidthNodes(x) {
	if (x > 500) {
		return x / (x / 500);
	}
	else if (x < -500) {
		return -((x / (x / 500)));
	}
	else {
		return x;
	}
}

function fixConflicts(arr) {
	var conflicts = {}, a, b, l, l2;
	for (a = 0, l = arr.length; a < l; a++) {
		for (b = 0; b < l; b++) {
			if (a != b && ((arr[a].position.x < arr[b].position.x + 10 && arr[a].position.x > arr[b].position.x - 10) && arr[a].position.y == arr[b].position.y)) {
				if (!conflicts[arr[a].position.y]) conflicts[arr[a].position.y] = [];
				conflicts[arr[a].position.y].push(arr[a]);
			}
		}
	}
	for (var k in conflicts) {
		var offset = 0, units = [];
		for (b = 0, l2 = conflicts[k].length; b < l2; b++) {
			for (a = 0; a < l; a++) {
				if (arr[a].data.id == conflicts[k][b].data.id && units.indexOf(arr[a].data.id) == -1) {
					units.push(arr[a].data.id);
					if (arr[a].position.x < 0) {
						offset -= 60;
					}
					else {
						offset += 60;
					}
					arr[a].position.x += offset;
				}
			}
		}
	}
	return arr;
}

function createEdges() {
	var _edges = cloneObj(edges), cyEdges = _cy.edges(), cyEdgesLength = cyEdges.length, k, out = [], position,
		offset = 0, offsetTop = 0, classes = '';
	for (var a = 0, l = cyEdgesLength; a < l; a++) {
		k = cyEdges[a].source() + '_' + cyEdges[a].target();
		if (_edges[k]) delete _edges[k];
	}
	for (k in phantoms) {
		_cy.getElementById(k).position('y', generateOffset + 166);
	}
	for (k in phantomsTop) {
		_cy.getElementById(k).position('y', newOffset - 166);
	}
	for (k in _edges) {
		if (_edges.hasOwnProperty(k)) {
			classes = '';
			classes += _edges[k].best_parent_unit ? 'best_parent_unit' : '';
			if (_cy.getElementById(_edges[k].data.target).length) {
				out.push({group: "edges", data: _edges[k].data, classes: classes});
			}
			else {
				position = _cy.getElementById(_edges[k].data.source).position();
				phantoms[_edges[k].data.target] = position.x + offset;
				out.push({
					group: "nodes",
					data: {id: _edges[k].data.target, unit_s: _edges[k].data.target.substr(0, 7) + '...'},
					position: {x: position.x + offset, y: generateOffset + 166}
				});
				offset += 60;
				out.push({group: "edges", data: _edges[k].data, classes: classes});
			}
			if (!_cy.getElementById(_edges[k].data.source).length) {
				position = _cy.getElementById(_edges[k].data.target).position();
				phantomsTop[_edges[k].data.source] = position.x + offsetTop;
				out.push({
					group: "nodes",
					data: {id: _edges[k].data.source, unit_s: _edges[k].data.source.substr(0, 7) + '...'},
					position: {x: position.x + offsetTop, y: newOffset - 166}
				});
				offsetTop += 60;
				out.push({group: "edges", data: _edges[k].data, classes: classes});
			}
		}
	}
	return out;
}

function setChangesStableUnits(arrStableUnits) {
	if (!arrStableUnits) return;
	var node;
	arrStableUnits.forEach(function(objUnit) {
		node = _cy.getElementById(objUnit.unit);
		if (node) {
			if (!node.hasClass('is_stable')) node.addClass('is_stable');
			if (objUnit.is_on_main_chain === 1 && !node.hasClass('is_on_main_chain')) {
				node.addClass('is_on_main_chain');
			}
			else if (objUnit.is_on_main_chain === 0 && node.hasClass('is_on_main_chain')) {
				node.removeClass('is_on_main_chain');
			}
		}
		notStable.splice(notStable.indexOf(objUnit.unit), 1);
	});
	updListNotStableUnit();
}

function cloneObj(obj) {
	var out = {};
	for (var k in obj) {
		if (obj.hasOwnProperty(k)) {
			out[k] = obj[k];
		}
	}
	return out;
}

function highlightNode(unit) {
	if (!_cy) createCy();
	if (activeNode) _cy.getElementById(activeNode).removeClass('active');
	var el = _cy.getElementById(unit);
	if (el.length && phantoms[unit] === undefined && phantomsTop[unit] === undefined) {
		var extent = _cy.extent();
		var elPositionY = el.position().y;
		lastActiveUnit = location.hash.substr(1);
		el.addClass('active');
		activeNode = el.id();
		socket.emit('info', {unit: activeNode});
		if (elPositionY < extent.y1 || elPositionY > extent.y2) {
			bWaitingForPrev = true;
			_cy.stop();
			_cy.animate({
				pan: {x: _cy.pan('x'), y: _cy.getCenterPan(el).y},
				complete: function() {
					bWaitingForPrev = false;
				}
			}, {
				duration: 250
			});
		}
		page = 'dag';
	}
	else {
		waitGo = unit;
		getHighlightNode(waitGo);
	}
	return false;
}

function scrollUp() {
	var ext = _cy.extent();
	if ((notLastUnitUp === false && ext.y2 - (ext.h / 2) > _cy.getElementById(nodes[0].data.unit).position().y + 20) ||
		(notLastUnitUp === true && ext.y2 - (ext.h) > _cy.getElementById(nodes[0].data.unit).position().y)
	) {
		_cy.panBy({x: 0, y: 25});
	}
	else if (notLastUnitUp === true) {
		getPrev();
	}
}

function showHideBlock(event, id) {
	var block = $('#' + id);
	var target;
	if (event.target.classList.contains('infoTitle')) {
		target = $(event.target);
	}
	else {
		target = $(event.target.parentNode);
	}
	if (block.css('display') === 'none') {
		block.show(250);
		target.removeClass('hideTitle');
	}
	else {
		block.hide(250);
		target.addClass('hideTitle');
	}
}

function searchForm(text) {
	if (text.length == 44 || text.length == 32) {
		location.hash = text;
	}
	else {
		showInfoMessage("Please enter a unit or address");
	}
	$('#inputSearch').val('');
}

function goToTop() {
	if (notLastUnitUp) {
		socket.emit('start', {type: 'last'});
	} else {
		var el = _cy.getElementById(nodes[0].data.unit);
		_cy.stop();
		_cy.animate({
			pan: {x: _cy.pan('x'), y: _cy.getCenterPan(el).y}
		}, {
			duration: 400
		});
	}
	location.hash = '';
	if (activeNode) _cy.getElementById(activeNode).removeClass('active');
	if (!$('#info').hasClass('hideInfoBlock')) $('#info').addClass('hideInfoBlock');
	if ($('#cy').hasClass('showInfoBlock')) $('#cy, #scroll').removeClass('showInfoBlock');

	$('#defaultInfo').show();
	$('#listInfo').hide();
}

//events
window.addEventListener('hashchange', function() {
	if (location.hash.length == 45) {
		highlightNode(location.hash.substr(1));
		if ($('#addressInfo').css('display') == 'block') {
			$('#addressInfo').hide();
		}
	}
	else if (location.hash.length == 33) {
		socket.emit('start', {type: 'address', address: location.hash.substr(1)});
	}
});

window.addEventListener('keydown', function(e) {
	if (page == 'dag') {
		if (e.keyCode == 38) {
			e.preventDefault();
			scrollUp();
		}
		else if (e.keyCode == 40) {
			e.preventDefault();
			_cy.panBy({x: 0, y: -25});
		}
	}
}, true);

$(window).scroll(function() {
	if (($(window).scrollTop() + $(window).height()) + 200 >= $(document).height()) {
		if (!nextPageTransactionsEnd) {
			getNextPageTransactions();
		}
	}
});

//websocket
var socket = io.connect(location.href);
var bWaitingForNext = false, bWaitingForNew = false, bHaveDelayedNewRequests = false, bWaitingForPrev = false,
	bWaitingForHighlightNode = false, bWaitingForNextPageTransactions = false;
var nextPageTransactionsEnd = false, lastInputsROWID = 0, lastOutputsROWID = 0;

socket.on('connect', function() {
	start();
});

socket.on('start', function(data) {
	init(data.nodes, data.edges);
	if (data.not_found) showInfoMessage("Unit not found");
	notLastUnitDown = true;
	if (bWaitingForHighlightNode) bWaitingForHighlightNode = false;
});

socket.on('next', function(data) {
	if (notLastUnitDown) {
		if (bWaitingForHighlightNode) bWaitingForHighlightNode = false;
		nodes = nodes.concat(data.nodes);
		for (var k in data.edges) {
			if (data.edges.hasOwnProperty(k)) {
				edges[k] = data.edges[k];
			}
		}
		lastUnit = nodes[nodes.length - 1].rowid;
		generate(data.nodes, data.edges);
		bWaitingForNext = false;
		if (waitGo) {
			highlightNode(waitGo);
			waitGo = false;
		}
		if (data.nodes.length === 0) {
			notLastUnitDown = false;
		}
		setChangesStableUnits(data.arrStableUnits);
	}
});

socket.on('prev', function(data) {
	if (bWaitingForHighlightNode) bWaitingForHighlightNode = false;
	if (data.nodes.length) {
		nodes = [].concat(data.nodes, nodes);
		for (var k in data.edges) {
			if (data.edges.hasOwnProperty(k)) {
				edges[k] = data.edges[k];
			}
		}
		firstUnit = data.nodes[0].rowid;
		setNew(data.nodes, data.edges);
	}
	bWaitingForPrev = false;
	if (data.end === true) {
		notLastUnitUp = false;
	}
	if (waitGo) {
		highlightNode(waitGo);
		waitGo = false;
	}
	setChangesStableUnits(data.arrStableUnits);
});

function generateMessageInfo(messages, transfersInfo, outputsUnit, assocCommissions) {
	var messagesOut = '', blockId = 0, key, asset, shownHiddenPayments = false;
	messages.forEach(function(message) {
		if (message.payload) {
			asset = message.payload.asset || 'null';
			messagesOut +=
				'<div class="message">' +
				'<div class="message_app infoTitleChild" onclick="showHideBlock(event, \'message_' + blockId + '\')">';
			if (message.app == 'payment') {
				messagesOut += message.app.substr(0, 1).toUpperCase() + message.app.substr(1) + ' in ' + (asset == 'null' ? 'bytes' : asset);
			}
			else if (message.app == 'asset') {
				messagesOut += 'Definition of new asset';
			}
			else {
				messagesOut += message.app.substr(0, 1).toUpperCase() + message.app.substr(1);
			}
			messagesOut += '</div>' +
				'<div class="messagesInfo" id="message_' + (blockId++) + '">';

			switch (message.app) {
				case 'payment':
					if (message.payload) {
						messagesOut += '<div class="message_inputs"><div class="infoTitleInputs" onclick="showHideBlock(event, \'message_' + blockId + '\')">Inputs</div>' +
							'<div class="inputsInfo" id="message_' + (blockId++) + '">';

						message.payload.inputs.forEach(function(input) {
							if (input.type && input.type == 'issue') {
								messagesOut +=
									'<div class="infoTitleInput" onclick="showHideBlock(event, \'message_' + blockId + '\')">Issue</div>' +
									'<div class="inputInfo" id="message_' + (blockId++) + '">' +
									'<div>Serial number: ' + input.serial_number + '</div>' +
									'<div>Amount: <span class="numberFormat">' + input.amount + '</span></div>' +
									'</div>';
							}
							else if (input.output_index !== undefined) {
								key = input.unit + '_' + input.output_index + '_' + (asset);
								messagesOut += '<div><span class="numberFormat">' + transfersInfo[key].amount + '</span> from ' +
									'<a href="#' + transfersInfo[key].unit + '">' + transfersInfo[key].unit + '</a></div>';
							} else if (input.type === 'headers_commission' || input.type === 'witnessing') {
								key = input.from_main_chain_index + '_' + input.to_main_chain_index;
								var objName = (input.type === 'headers_commission' ? 'headers' : (input.type === 'witnessing' ? 'witnessing' : false));
								if (objName) {
									messagesOut += '<div><span class="numberFormat">' + assocCommissions[objName][key].sum + '</span> bytes of ' + objName + ' commissions on <a href="#' + assocCommissions[objName][key].address + '">' + assocCommissions[objName][key].address + '</a>' +
										' from mci ' + assocCommissions[objName][key].from_mci + ' to mci ' + assocCommissions[objName][key].to_mci + '</div>';
								}
							}
						});

						messagesOut += '</div></div>' +
							'<div class="message_outputs"><div class="infoTitleInputs" onclick="showHideBlock(event, \'message_' + blockId + '\')">Outputs</div>' +
							'<div class="inputsInf" id="message_' + (blockId++) + '">';

						outputsUnit[asset].forEach(function(output) {
							messagesOut += '<div class="outputs_div">';
							if (output.is_spent) {
								messagesOut += '<div><span class="numberFormat">' + output.amount + '</span> to <a href="#' + output.address + '">' + output.address + '</a><br> ' +
									'(spent in <a href="#' + output.spent + '">' + output.spent + '</a>)</div>';
							}
							else {
								messagesOut += '<div><span class="numberFormat">' + output.amount + '</span> to <a href="#' + output.address + '">' + output.address + '</a><br> (not spent)</div>';
							}
							messagesOut += '</div>';
						});

						messagesOut += '</div></div>';
					}
					break;
				case 'text':
					messagesOut += '<div>Text: ' + htmlEscape(message.payload) + '</div>';
					break;
				default:
					for (var key_payload in message.payload) {
						if (message.app == 'asset' && key_payload == 'denominations') {
							messagesOut += '<div>denominations:</div><div>';
							messagesOut += JSON.stringify(message.payload[key_payload]);
							messagesOut += '</div>';
						}
						else if (typeof message.payload[key_payload] === "object") {
							messagesOut += '<div>' + htmlEscape(key_payload) + ':</div><div>';
							messagesOut += htmlEscape(JSON.stringify(message.payload[key_payload]));
							messagesOut += '</div>';
						} else {
							messagesOut += '<div>' + htmlEscape(key_payload + ': ' + message.payload[key_payload]) + '</div>';
						}
					}
					break;
			}
			messagesOut += '</div></div>';
		} else if (message.app == 'payment' && message.payload_location == 'none' && !shownHiddenPayments) {
			messagesOut += '<div class="message childNotSpoiler">Hidden payments</div>';
			shownHiddenPayments = true;
		}
	});
	return messagesOut;
}

socket.on('info', function(data) {
	if (bWaitingForHighlightNode) bWaitingForHighlightNode = false;
	if (data) {
		var childOut = '', parentOut = '', authorsOut = '', witnessesOut = '';
		data.child.forEach(function(unit) {
			childOut += '<div><a href="#' + unit + '">' + unit + '</a></div>';
		});
		data.parents.forEach(function(unit) {
			parentOut += '<div><a href="#' + unit + '">' + unit + '</a></div>';
		});
		var incAuthors = 0;
		data.authors.forEach(function(author) {
			authorsOut += '<div><a href="#' + author.address + '">' + author.address + '</a>';
			if (author.definition) {
				authorsOut += '<span class="infoTitle hideTitle" class="definitionTitle" onclick="showHideBlock(event, \'definition' + incAuthors + '\')">Definition<div class="infoTitleImg"></div></span>' +
					'<div id="definition' + (incAuthors++) + '" style="display: none"><pre>' + JSON.stringify(JSON.parse(author.definition), null, '   ') + '</pre></div>';

			}
			authorsOut += '</div>';
		});
		data.witnesses.forEach(function(witness) {
			witnessesOut += '<div><a href="#' + witness + '">' + witness + '</a></div>';
		});

		$('#unit').html(data.unit);
		$('#children').html(childOut);
		$('#parents').html(parentOut);
		$('#authors').html(authorsOut);
		$('#received').html(moment(data.date).format('DD.MM.YYYY HH:mm:ss'));
		$('#fees').html('<span class="numberFormat">' + (parseInt(data.headers_commission) + parseInt(data.payload_commission)) + '</span> (<span class="numberFormat">' + data.headers_commission + '</span> headers, <span class="numberFormat">' + data.payload_commission + '</span> payload)');
		$('#last_ball_unit').html('<a href="#'+data.last_ball_unit+'">'+data.last_ball_unit+'</a>');
		$('#level').html(data.level);
		$('#witnessed_level').html(data.witnessed_level);
		$('#main_chain_index').html(data.main_chain_index);
		$('#latest_included_mc_index').html(data.latest_included_mc_index);
		$('#is_stable').html(data.is_stable);
		$('#witnesses').html(witnessesOut);
		$('#messages').html(data.sequence === 'final-bad' ? '' : generateMessageInfo(data.messages, data.transfersInfo, data.outputsUnit, data.assocCommissions));
		if ($('#listInfo').css('display') === 'none') {
			$('#defaultInfo').hide();
			$('#listInfo').show();
		}
		if (data.sequence === 'final-bad') {
			$('#divTitleMessage,#divFees').hide();
		} else {
			$('#divTitleMessage,#divFees').show();
		}
		adaptiveShowInfo();
		formatAllNumbers();
	}
	else {
		showInfoMessage("Unit not found");
	}
});

socket.on('update', getNew);

socket.on('new', function(data) {
	if (data.nodes.length) {
		nodes = [].concat(data.nodes, nodes);
		for (var k in data.edges) {
			if (data.edges.hasOwnProperty(k)) {
				edges[k] = data.edges[k];
			}
		}
		firstUnit = nodes[0].rowid;
		setNew(data.nodes, data.edges, true);
		if (bHaveDelayedNewRequests) {
			bHaveDelayedNewRequests = false;
			getNew();
		}
		if (data.nodes.length >= 100) {
			notLastUnitUp = true;
		}
	}
	bWaitingForNew = false;
	setChangesStableUnits(data.arrStableUnits);
});

function generateTransactionsList(objTransactions, address) {
	var transaction, addressOut, _addressTo, listTransactions = '';
	for (var k in objTransactions) {
		transaction = objTransactions[k];

		listTransactions += '<tr>' +
			'<th class="transactionUnit" colspan="2" align="left">' +
			'<div>Unit <a href="#' + transaction.unit + '">' + transaction.unit + '</a></div>' +
			'</th><th class="transactionUnit" colspan="1" align="right"><div style="font-weight: normal">' + moment(transaction.date).format('DD.MM.YYYY HH:mm:ss') + '</div></th>' +
			'</tr>' +
			'<tr><th colspan="3"><div style="margin: 5px"></div></th></tr>' +
			'<tr><td>';
		transaction.from.forEach(function(objFrom) {
			if (objFrom.issue) {
				listTransactions += '<div class="transactionUnitListAddress">' +
					'<div>' + addressOut + '</div>' +
					'<div>Issue <span class="numberFormat">' + objFrom.amount + '</span> ' + transaction.asset + '</div>' +
					'<div>serial number: ' + objFrom.serial_number + '</div></div>';
			} else if (objFrom.commissionType && (objFrom.commissionType === 'headers' || objFrom.commissionType === 'witnessing')) {
				var commissionName = (objFrom.commissionType === 'headers' ? 'headers' : (objFrom.commissionType === 'witnessing' ? 'witnessing' : false));
				if (commissionName) {
					addressOut = objFrom.address == address ? '<span class="thisAddress">' + objFrom.address + '</span>' : '<a href="#' + objFrom.address + '">' + objFrom.address + '</a>';
					listTransactions += '<div class="transactionUnitListAddress">' +
						'<div>' + addressOut + ' ' + commissionName + ' commissions from mci ' + objFrom.from_mci +
						' to mci ' + objFrom.to_mci + '.' +
						' Sum: <span class="numberFormat">' + objFrom.sum + '</span> bytes</div>' +
						'</div>';
				}
			}
			else {
				addressOut = objFrom.address == address ? '<span class="thisAddress">' + objFrom.address + '</span>' : '<a href="#' + objFrom.address + '">' + objFrom.address + '</a>';
				listTransactions += '<div class="transactionUnitListAddress"><div>' + addressOut + '</div>' +
					'<div>(<span class="numberFormat">' + objFrom.amount + '</span> ' + (transaction.asset == null ? 'bytes' : transaction.asset) + ')</div></div>';
			}
		});
		listTransactions += '</td><td><img width="32" src="' + (transaction.spent ? '/img/red_right2.png' : '/img/green_right2.png') + '"></td><td>';
		for (var k in transaction.to) {
			_addressTo = transaction.to[k];
			addressOut = _addressTo.address == address ? '<span class="thisAddress">' + _addressTo.address + '</span>' : '<a href="#' + _addressTo.address + '">' + _addressTo.address + '</a>';

			listTransactions += '<div class="transactionUnitListAddress"><div>' + addressOut + '</div>' +
				'<div>(<span class="numberFormat">' + _addressTo.amount + '</span> ' + (transaction.asset == null ? 'bytes' : transaction.asset) + ', ' +
				(_addressTo.spent === 0 ? 'not spent' : 'spent in ' + '<a href="#' + _addressTo.spent + '">' + _addressTo.spent + '</a>') +
				')</div></div>';
		}
		listTransactions += '</td></tr><tr><th colspan="3"><div style="margin: 10px"></div></th></tr>';
	}
	return listTransactions;
}

socket.on('addressInfo', function(data) {
	if (data) {
		var listUnspent = '', balance = '';
		lastInputsROWID = data.newLastInputsROWID;
		lastOutputsROWID = data.newLastOutputsROWID;
		nextPageTransactionsEnd = data.end;
		for (var k in data.objBalance) {
			if (k === 'bytes') {
				balance += '<div><span class="numberFormat">' + data.objBalance[k] + '</span> bytes</div>';
			}
			else {
				balance += '<div><span class="numberFormat">' + data.objBalance[k] + '</span> of ' + k + '</div>';
			}
		}
		if(data.unspent) {
			data.unspent.forEach(function(row) {
				listUnspent += '<div><a href="#' + row.unit + '">' + row.unit + '</a> (<span class="numberFormat">' + row.amount + '</span> ' + (row.asset == null ? 'bytes' : row.asset) + ')</div>';
			});
		}
		$('#address').html(data.address);
		$('#balance').html(balance);
		$('#listUnspent').html(listUnspent);
		var transactionsList = generateTransactionsList(data.objTransactions, data.address);
		if(transactionsList) {
			$('#listUnits').html(transactionsList);
			$('#titleListTransactions').show();
		}else{
			$('#listUnits').html('');
			$('#titleListTransactions').hide();
		}
		if (listUnspent !== '') {
			$('#blockListUnspent').show();
		}
		else {
			$('#blockListUnspent').hide();
		}
		if ($('#addressInfo').css('display') == 'none') {
			$('#addressInfo').show();
		}
		if (data.definition) {
			$('#definitionTitleInAddress').show();
			$('#definition').html('<pre>' + JSON.stringify(JSON.parse(data.definition), null, '   ') + '</pre>');
		} else {
			$('#definition').hide();
			if (!$('#definitionTitleInAddress').hasClass('hideTitle')) {
				$('#definitionTitleInAddress').addClass('hideTitle');
			}
			$('#definitionTitleInAddress').hide();
		}
		page = 'address';
		formatAllNumbers()
	}
	else {
		showInfoMessage("Address not found");
	}
	bWaitingForNextPageTransactions = false;
	if (!nextPageTransactionsEnd && $('#tableListTransactions').height() < $(window).height()) getNextPageTransactions();
});

socket.on('nextPageTransactions', function(data) {
	if (data) {
		if (data.newLastOutputsROWID && data.newLastOutputsROWID) {
			lastInputsROWID = data.newLastInputsROWID;
			lastOutputsROWID = data.newLastOutputsROWID;
		}
		nextPageTransactionsEnd = data.end;
		$('#listUnits').append(generateTransactionsList(data.objTransactions, data.address));
		formatAllNumbers();
	}
	bWaitingForNextPageTransactions = false;
	if (!nextPageTransactionsEnd && $('#tableListTransactions').height() < $(window).height()) getNextPageTransactions();
});

function getNew() {
	if (notLastUnitUp) return;

	if (!bWaitingForNew) {
		socket.emit('new', {unit: firstUnit, notStable: notStable});
		bWaitingForNew = true;
	}
	else {
		bHaveDelayedNewRequests = true;
	}
}

function getNext() {
	if (!bWaitingForNext && isInit) {
		socket.emit('next', {last: lastUnit, notStable: notStable});
		bWaitingForNext = true;
	}
}

function getPrev() {
	if (!bWaitingForPrev && isInit) {
		socket.emit('prev', {first: firstUnit, notStable: notStable});
		bWaitingForPrev = true;
	}
}

function getHighlightNode(unit) {
	if (!bWaitingForHighlightNode) {
		socket.emit('highlightNode', {first: firstUnit, last: lastUnit, unit: unit});
		bWaitingForHighlightNode = true;
	}
}

function getNextPageTransactions() {
	if (!bWaitingForNextPageTransactions && location.hash.length == 33) {
		socket.emit('nextPageTransactions', {
			address: location.hash.substr(1),
			lastInputsROWID: lastInputsROWID,
			lastOutputsROWID: lastOutputsROWID
		});
		bWaitingForNextPageTransactions = true;
	}
}

//adaptive
function adaptiveShowInfo() {
	$('#cy, #scroll, #goToTop').addClass('showInfoBlock');
	$('#info').removeClass('hideInfoBlock');
}

function closeInfo() {
	$('#info').addClass('hideInfoBlock');
	$('#cy, #scroll, #goToTop').removeClass('showInfoBlock');
}

function closeAddress() {
	$('#addressInfo').hide();
	$('#blockListUnspent').hide();
	if (!_cy || !lastActiveUnit) {
		$('#cy, #scroll, #goToTop').show();
		socket.emit('start', {type: 'last'});
		location.hash = '';
	}
	else {
		location.hash = lastActiveUnit;
	}
	page = 'dag';
}


//infoMessage
var timerInfoMessage;

function showInfoMessage(text, timeMs) {
	if (!timeMs) timeMs = 3000;
	if (timerInfoMessage) clearTimeout(timerInfoMessage);

	$('#infoMessage').html(text).show(350);
	timerInfoMessage = setTimeout(function() {
		$('#infoMessage').hide(350).html('');
	}, timeMs);
}

function hideInfoMessage() {
	if (timerInfoMessage) clearTimeout(timerInfoMessage);
	$('#infoMessage').hide(350).html('');
}


//scroll
var scroll = $('#scroll');
var scrollTopPos = 0, scrollLowPos;

function updateScrollHeigth() {
	var unitTopPos = _cy.getCenterPan(_cy.getElementById(nodes[0].data.unit)).y;
	var unitLowPos = _cy.getCenterPan(_cy.getElementById(nodes[nodes.length - 1].data.unit)).y;
	scrollTopPos = convertPosPanToPosScroll(unitTopPos, 0);
	scrollLowPos = convertPosPanToPosScroll(unitLowPos) + (scroll.height()) + 116;
	$('#scrollBody').height(convertPosPanToPosScroll(unitLowPos - unitTopPos, 0) + (scroll.height() / 2));
	setTimeout(function() {
		scroll.scrollTop(convertPosPanToPosScroll());
	}, 1);
}

scroll.scroll(function(e) {
	e.preventDefault();
	_cy.pan('y', convertPosScrollToPosPan());
});

$(window).resize(function() {
	if (_cy) scroll.scrollTop(convertPosPanToPosScroll());
});

function convertPosScrollToPosPan(posTop) {
	if (!posTop) posTop = scroll.scrollTop();
	return ((scroll.height() / 2) - scrollTopPos) - posTop;
}

function convertPosPanToPosScroll(posY, topPos) {
	if (!posY) posY = _cy.pan('y');
	if (topPos === undefined) topPos = scrollTopPos;
	return ((scroll.height() / 2) - topPos) - posY;
}

//Numbers

function numberFormat(number) {
	return number.replace(new RegExp("^(\\d{" + (number.length % 3 ? number.length % 3 : 0) + "})(\\d{3})", "g"), "$1 $2").replace(/(\d{3})+?/gi, "$1 ").trim().replace(/\s/gi, ",");
}

function formatAllNumbers() {
	var numbersSpan = $('.numberFormat').not('.format');
	$.each(numbersSpan, function(a, v) {
		$(numbersSpan[a]).addClass('format').html(numberFormat(v.innerHTML));
	})
}

$(document).on('mousedown', '.numberFormat', function(e) {
	var self = $(this);
	if (self.hasClass('format')) {
		self.html(self.html().replace(/\,/g, '')).removeClass('format');
	}
});
$(document).on('touchstart', '.numberFormat', function() {
	var self = $(this);
	if (self.hasClass('format')) {
		self.html(self.html().replace(/\,/g, '')).removeClass('format');
	}
});
$(document).on('mouseout', '.numberFormat', function() {
	var self = $(this);
	if (!self.hasClass('format')) {
		self.addClass('format');
		setTimeout(function() {
			self.html(numberFormat(self.html()));
		}, 250);
	}
});


//escape
function htmlEscape(str) {
	return str
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}
