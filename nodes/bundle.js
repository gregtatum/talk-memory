(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * Run a step of modifying a node graph. This takes a JSON structure as can
 * be seen in the src/actions folder that then defines how to modify the node
 * graph.
 */

const NODE_SPREAD = 0.01

exports.addNode = function ({el, nodes, links}, node) {
  // Allow nodes to be renamed later on, but always revert when re-adding.
  if(node.rename) {
    node.rename = ""
  }

  // Nodes tend to be funky with the force layout when incrementally added.
  // Place them near the center randomly to aid in the layout on the screen.
  if(node.x === undefined) {
    const w = el.offsetWidth
    const h = el.offsetHeight / 2
    node.x = w / 2 + (Math.random() * w - w / 2) * NODE_SPREAD
    node.y = h / 2 + (Math.random() * h - h / 2) * NODE_SPREAD
  }
  nodes.push(node)
},

exports.rename = function ({nodes, links}, [id, value]) {
  const node = nodes.find(n => n.id === id)
  if (!node) throw new Error("Could not find that node to remove.")
  node.rename = value
},

exports.addLink = function ({nodes, links}, [sourceId, targetId, dashed]) {
  const source = nodes.find(({id}) => id === sourceId)
  const target = nodes.find(({id}) => id === targetId)
  if(!source || !target) {
    throw new Error("Could not find those nodes to link.")
  }
  links.push({source, target, dashed: Boolean(dashed)})
},

exports.removeNode = function ({nodes, links}, id) {
  const node = nodes.find(n => n.id === id)
  if (!node) throw new Error("Could not find that node to remove.")
  nodes.splice(nodes.indexOf(node), 1)
},

exports.removeLink = function ({nodes, links}, [sourceId, targetId]) {
  const link = links.find(({source, target}) => {
    return source.id === sourceId && target.id === targetId
  })
  if (!link) throw new Error("Could not find that link to remove.")
  links.splice(links.indexOf(link), 1)
}

exports.highlight = function ({editor}, value) {

  let [start, end] = Array.isArray(value) ? value : [value, value]
  let [startLine, startCh] = String(start).split(':')
  let [endLine, endCh] = String(end).split(':')

  if(!endCh) {
    endLine++
  }
  startCh = Math.max(0, startCh-1)
  endCh = Math.max(0, endCh-1)

  editor.markText(
    {line: startLine - 1, ch: startCh || 0},
    {line: endLine - 1, ch: endCh || 0},
    {
      className: "highlighted-line"
    }
  )
}

},{}],2:[function(require,module,exports){
exports.code = `function createTenElements() {
  var array = [];

  for(var i=0; i < 10; i++) {
    array[i] = i;
  }

  return array;
}

var myArray = createTenElements()
`

exports.steps = [
  [
    ["addNode", {name: "window", id: "window"}],
    ["addNode", {name: "callStack", id: "callStack"}],
    ["addLink", ["window", "callStack", "dashed"]],
  ],
  [
    ["highlight", [1, 9]]
  ],
  [
    ["addNode", {display: "createTenElements", name: "function", id: "createTenElements"}],
    ["addLink", ["callStack", "createTenElements"]],
    ["highlight", ["11:15", "11:34"]]
  ],
  [
    ["addNode", {name: "array", id: "array"}],
    ["addLink", ["createTenElements", "array"]],
    ["highlight", ["2:3", "2:18"]]
  ],
  [
    ["highlight", [4, 6]],
    ["addNode", {display: "0", name: "value", id: "array-0"}],
    ["addNode", {display: "1", name: "value", id: "array-1"}],
    ["addNode", {display: "2", name: "value", id: "array-2"}],
    ["addNode", {display: "3", name: "value", id: "array-3"}],
    ["addNode", {display: "4", name: "value", id: "array-4"}],
    ["addNode", {display: "5", name: "value", id: "array-5"}],
    ["addNode", {display: "6", name: "value", id: "array-6"}],
    ["addNode", {display: "7", name: "value", id: "array-7"}],
    ["addNode", {display: "8", name: "value", id: "array-8"}],
    ["addNode", {display: "9", name: "value", id: "array-9"}],
    ["addLink", ["array", "array-0"]],
    ["addLink", ["array", "array-1"]],
    ["addLink", ["array", "array-2"]],
    ["addLink", ["array", "array-3"]],
    ["addLink", ["array", "array-4"]],
    ["addLink", ["array", "array-5"]],
    ["addLink", ["array", "array-6"]],
    ["addLink", ["array", "array-7"]],
    ["addLink", ["array", "array-8"]],
    ["addLink", ["array", "array-9"]],
  ],
  [
    ["highlight", 8],
  ],
  [
    ["removeNode", "createTenElements"],
    ["removeLink", ["callStack", "createTenElements"]],
    ["removeLink", ["createTenElements", "array"]],
    ["addLink", ["window", "array"]],
    ["rename", ["array", "myArray"]],
    ["highlight", ["11:1", "11:12"]]
  ]
]

},{}],3:[function(require,module,exports){
exports.GROUP = Object.freeze({
  window: 0,
  array: 1,
  object: 2,
  function: 3,
  value: 4,
  callStack: 5,
})

exports.SIZE = Object.freeze({
  window: 4,
  callStack: 3,
  function: 3,
  array: 2,
  object: 2,
  value: 1
})

exports.LENGTH = Object.freeze({
  window: 10,
  callStack: 10,
  function: 10,
  array: 2,
  object: 2,
  value: 0.3
})

},{}],4:[function(require,module,exports){
module.exports = function name (code) {
  const container = document.querySelector('.editor')
  const editor = CodeMirror(container, {
    value: code || "// No code provided",
    mode: "javascript",
    lineNumbers: true
  })
  return editor
}

},{}],5:[function(require,module,exports){
// const { nodes, links } = require('./actions/demo')
const { GROUP, SIZE, LENGTH } = require('./constants')
const demo = require('./actions/create-ten-elements')
const actionStepper = require('./action-stepper')
const startEditor = require('./editor')

;(function() {
  const graph = new MemoryGraph(demo.steps)
  graph.editor = startEditor(demo.code)

  setupForceTick(graph)
  addKeyboardListener(graph)
  addResizeListener(graph.force, graph.el)
})()

function MemoryGraph(stepsJson) {
  const el = document.querySelector('.node')
  this.el = el
  this.svg = d3.select(".node")
    .append("svg")
    .attr("width", el.offsetWidth)
    .attr("height", el.offsetHeight)

  this.color = d3.scale.category20()

  this.force = d3.layout.force()
      .gravity(0.05)
      .distance(d => SIZE[d.target.name] * 50)
      .charge(-100)
      .size([el.offsetWidth, el.offsetHeight])

  this.$link = this.svg.append("g").selectAll(".link")
  this.$node = this.svg.append("g").selectAll(".node")
  this.nodes = []
  this.links = []
  this.stepsJson = stepsJson
}

function runStep(graph, i) {
  graph.editor.getAllMarks().forEach(mark => mark.clear())
  graph.stepsJson[i].forEach(([action, value]) => {
    actionStepper[action](graph, value)
  })
}

function runStepsTo(graph, i) {
  graph.nodes = []
  graph.links = []
  for(let j=0; j <= i; j++) runStep(graph, j)
}

function addKeyboardListener(graph) {
  const KEY_RIGHT = 39
  const KEY_LEFT = 37
  let currentStep = 0
  let {nodes, stepsJson, force} = graph

  runStepsTo(graph, currentStep)
  updateView(graph)

  // Move the graph step left or right by keyboard
  window.addEventListener('keyup', e => {
    if(e.keyCode === KEY_RIGHT) {
      const nextStep = Math.min(currentStep + 1, stepsJson.length - 1)
      if (nextStep !== currentStep) {
        currentStep = nextStep
        runStep(graph, currentStep)
        updateView(graph)
      }
    } else if(e.keyCode === KEY_LEFT) {
      const nextStep = Math.max(currentStep - 1, 0)
      if (nextStep !== currentStep) {
        currentStep = nextStep
        runStepsTo(graph, currentStep)
        updateView(graph)
      }
    }
  })
}

function addResizeListener (force, el) {
  window.addEventListener('resize', () => {
    d3.select("svg")
      .attr("width", el.offsetWidth)
      .attr("height", el.offsetHeight)

    force.size([el.offsetWidth, el.offsetHeight])
  })
}

function updateView(graph) {
  const { force, color, nodes, links, el } = graph

  // Update the graph's selections with the changed data
  const $node = graph.$node.data(nodes)
  const $link = graph.$link.data(links)
  graph.$node = $node
  graph.$link = $link

  // Update DOM nodes' base group
  let enter = $node.enter().append("g")
  $link.enter().append("line")
  $node.exit().remove()
  $link.exit().remove()
  $node.html("")

  $node.attr("class", "node")
    .call(force.drag)

  $node.append("circle")
    .attr("class", "node-circle")
    .attr("r", d => 5 * SIZE[d.name])
    .style("fill", d => color(GROUP[d.name]))

  $node.append("text")
    .attr("dx", d => 5 + 4 * SIZE[d.name])
    .attr("dy", ".35em")
    // Priority order for text nodes, allow them to be renamed, or use the
    // display name. If none of those exist just use the node name type.
    .text(d => d.rename || d.display || d.name)

  $link.attr("class", "link")
      .attr("stroke-dasharray", ({dashed}) => dashed ? "5, 5" : false)

  // Restart force graph
  force
    .nodes(nodes)
    .links(links)
    .friction(0.8)
    .charge(-600)
    .gravity(0.1)
    .linkDistance(d => {
      return LENGTH[d.target.name] * el.offsetHeight / 60
    })
    // .linkStrength(0.01)
    // .theta(0.8)
    // .alpha(0.1)
    .start()
}

function setupForceTick (graph) {
  graph.force.on("tick", () => {
    graph.$node.attr("transform", (d) => `translate(${d.x},${d.y})`)
    graph.$link.attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y)
  })
}

},{"./action-stepper":1,"./actions/create-ten-elements":2,"./constants":3,"./editor":4}]},{},[5])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvYWN0aW9uLXN0ZXBwZXIuanMiLCJzcmMvYWN0aW9ucy9jcmVhdGUtdGVuLWVsZW1lbnRzLmpzIiwic3JjL2NvbnN0YW50cy5qcyIsInNyYy9lZGl0b3IuanMiLCJzcmMvbWFpbi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLyoqXG4gKiBSdW4gYSBzdGVwIG9mIG1vZGlmeWluZyBhIG5vZGUgZ3JhcGguIFRoaXMgdGFrZXMgYSBKU09OIHN0cnVjdHVyZSBhcyBjYW5cbiAqIGJlIHNlZW4gaW4gdGhlIHNyYy9hY3Rpb25zIGZvbGRlciB0aGF0IHRoZW4gZGVmaW5lcyBob3cgdG8gbW9kaWZ5IHRoZSBub2RlXG4gKiBncmFwaC5cbiAqL1xuXG5jb25zdCBOT0RFX1NQUkVBRCA9IDAuMDFcblxuZXhwb3J0cy5hZGROb2RlID0gZnVuY3Rpb24gKHtlbCwgbm9kZXMsIGxpbmtzfSwgbm9kZSkge1xuICAvLyBBbGxvdyBub2RlcyB0byBiZSByZW5hbWVkIGxhdGVyIG9uLCBidXQgYWx3YXlzIHJldmVydCB3aGVuIHJlLWFkZGluZy5cbiAgaWYobm9kZS5yZW5hbWUpIHtcbiAgICBub2RlLnJlbmFtZSA9IFwiXCJcbiAgfVxuXG4gIC8vIE5vZGVzIHRlbmQgdG8gYmUgZnVua3kgd2l0aCB0aGUgZm9yY2UgbGF5b3V0IHdoZW4gaW5jcmVtZW50YWxseSBhZGRlZC5cbiAgLy8gUGxhY2UgdGhlbSBuZWFyIHRoZSBjZW50ZXIgcmFuZG9tbHkgdG8gYWlkIGluIHRoZSBsYXlvdXQgb24gdGhlIHNjcmVlbi5cbiAgaWYobm9kZS54ID09PSB1bmRlZmluZWQpIHtcbiAgICBjb25zdCB3ID0gZWwub2Zmc2V0V2lkdGhcbiAgICBjb25zdCBoID0gZWwub2Zmc2V0SGVpZ2h0IC8gMlxuICAgIG5vZGUueCA9IHcgLyAyICsgKE1hdGgucmFuZG9tKCkgKiB3IC0gdyAvIDIpICogTk9ERV9TUFJFQURcbiAgICBub2RlLnkgPSBoIC8gMiArIChNYXRoLnJhbmRvbSgpICogaCAtIGggLyAyKSAqIE5PREVfU1BSRUFEXG4gIH1cbiAgbm9kZXMucHVzaChub2RlKVxufSxcblxuZXhwb3J0cy5yZW5hbWUgPSBmdW5jdGlvbiAoe25vZGVzLCBsaW5rc30sIFtpZCwgdmFsdWVdKSB7XG4gIGNvbnN0IG5vZGUgPSBub2Rlcy5maW5kKG4gPT4gbi5pZCA9PT0gaWQpXG4gIGlmICghbm9kZSkgdGhyb3cgbmV3IEVycm9yKFwiQ291bGQgbm90IGZpbmQgdGhhdCBub2RlIHRvIHJlbW92ZS5cIilcbiAgbm9kZS5yZW5hbWUgPSB2YWx1ZVxufSxcblxuZXhwb3J0cy5hZGRMaW5rID0gZnVuY3Rpb24gKHtub2RlcywgbGlua3N9LCBbc291cmNlSWQsIHRhcmdldElkLCBkYXNoZWRdKSB7XG4gIGNvbnN0IHNvdXJjZSA9IG5vZGVzLmZpbmQoKHtpZH0pID0+IGlkID09PSBzb3VyY2VJZClcbiAgY29uc3QgdGFyZ2V0ID0gbm9kZXMuZmluZCgoe2lkfSkgPT4gaWQgPT09IHRhcmdldElkKVxuICBpZighc291cmNlIHx8ICF0YXJnZXQpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJDb3VsZCBub3QgZmluZCB0aG9zZSBub2RlcyB0byBsaW5rLlwiKVxuICB9XG4gIGxpbmtzLnB1c2goe3NvdXJjZSwgdGFyZ2V0LCBkYXNoZWQ6IEJvb2xlYW4oZGFzaGVkKX0pXG59LFxuXG5leHBvcnRzLnJlbW92ZU5vZGUgPSBmdW5jdGlvbiAoe25vZGVzLCBsaW5rc30sIGlkKSB7XG4gIGNvbnN0IG5vZGUgPSBub2Rlcy5maW5kKG4gPT4gbi5pZCA9PT0gaWQpXG4gIGlmICghbm9kZSkgdGhyb3cgbmV3IEVycm9yKFwiQ291bGQgbm90IGZpbmQgdGhhdCBub2RlIHRvIHJlbW92ZS5cIilcbiAgbm9kZXMuc3BsaWNlKG5vZGVzLmluZGV4T2Yobm9kZSksIDEpXG59LFxuXG5leHBvcnRzLnJlbW92ZUxpbmsgPSBmdW5jdGlvbiAoe25vZGVzLCBsaW5rc30sIFtzb3VyY2VJZCwgdGFyZ2V0SWRdKSB7XG4gIGNvbnN0IGxpbmsgPSBsaW5rcy5maW5kKCh7c291cmNlLCB0YXJnZXR9KSA9PiB7XG4gICAgcmV0dXJuIHNvdXJjZS5pZCA9PT0gc291cmNlSWQgJiYgdGFyZ2V0LmlkID09PSB0YXJnZXRJZFxuICB9KVxuICBpZiAoIWxpbmspIHRocm93IG5ldyBFcnJvcihcIkNvdWxkIG5vdCBmaW5kIHRoYXQgbGluayB0byByZW1vdmUuXCIpXG4gIGxpbmtzLnNwbGljZShsaW5rcy5pbmRleE9mKGxpbmspLCAxKVxufVxuXG5leHBvcnRzLmhpZ2hsaWdodCA9IGZ1bmN0aW9uICh7ZWRpdG9yfSwgdmFsdWUpIHtcblxuICBsZXQgW3N0YXJ0LCBlbmRdID0gQXJyYXkuaXNBcnJheSh2YWx1ZSkgPyB2YWx1ZSA6IFt2YWx1ZSwgdmFsdWVdXG4gIGxldCBbc3RhcnRMaW5lLCBzdGFydENoXSA9IFN0cmluZyhzdGFydCkuc3BsaXQoJzonKVxuICBsZXQgW2VuZExpbmUsIGVuZENoXSA9IFN0cmluZyhlbmQpLnNwbGl0KCc6JylcblxuICBpZighZW5kQ2gpIHtcbiAgICBlbmRMaW5lKytcbiAgfVxuICBzdGFydENoID0gTWF0aC5tYXgoMCwgc3RhcnRDaC0xKVxuICBlbmRDaCA9IE1hdGgubWF4KDAsIGVuZENoLTEpXG5cbiAgZWRpdG9yLm1hcmtUZXh0KFxuICAgIHtsaW5lOiBzdGFydExpbmUgLSAxLCBjaDogc3RhcnRDaCB8fCAwfSxcbiAgICB7bGluZTogZW5kTGluZSAtIDEsIGNoOiBlbmRDaCB8fCAwfSxcbiAgICB7XG4gICAgICBjbGFzc05hbWU6IFwiaGlnaGxpZ2h0ZWQtbGluZVwiXG4gICAgfVxuICApXG59XG4iLCJleHBvcnRzLmNvZGUgPSBgZnVuY3Rpb24gY3JlYXRlVGVuRWxlbWVudHMoKSB7XG4gIHZhciBhcnJheSA9IFtdO1xuXG4gIGZvcih2YXIgaT0wOyBpIDwgMTA7IGkrKykge1xuICAgIGFycmF5W2ldID0gaTtcbiAgfVxuXG4gIHJldHVybiBhcnJheTtcbn1cblxudmFyIG15QXJyYXkgPSBjcmVhdGVUZW5FbGVtZW50cygpXG5gXG5cbmV4cG9ydHMuc3RlcHMgPSBbXG4gIFtcbiAgICBbXCJhZGROb2RlXCIsIHtuYW1lOiBcIndpbmRvd1wiLCBpZDogXCJ3aW5kb3dcIn1dLFxuICAgIFtcImFkZE5vZGVcIiwge25hbWU6IFwiY2FsbFN0YWNrXCIsIGlkOiBcImNhbGxTdGFja1wifV0sXG4gICAgW1wiYWRkTGlua1wiLCBbXCJ3aW5kb3dcIiwgXCJjYWxsU3RhY2tcIiwgXCJkYXNoZWRcIl1dLFxuICBdLFxuICBbXG4gICAgW1wiaGlnaGxpZ2h0XCIsIFsxLCA5XV1cbiAgXSxcbiAgW1xuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6IFwiY3JlYXRlVGVuRWxlbWVudHNcIiwgbmFtZTogXCJmdW5jdGlvblwiLCBpZDogXCJjcmVhdGVUZW5FbGVtZW50c1wifV0sXG4gICAgW1wiYWRkTGlua1wiLCBbXCJjYWxsU3RhY2tcIiwgXCJjcmVhdGVUZW5FbGVtZW50c1wiXV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIFtcIjExOjE1XCIsIFwiMTE6MzRcIl1dXG4gIF0sXG4gIFtcbiAgICBbXCJhZGROb2RlXCIsIHtuYW1lOiBcImFycmF5XCIsIGlkOiBcImFycmF5XCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIFtcImNyZWF0ZVRlbkVsZW1lbnRzXCIsIFwiYXJyYXlcIl1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCBbXCIyOjNcIiwgXCIyOjE4XCJdXVxuICBdLFxuICBbXG4gICAgW1wiaGlnaGxpZ2h0XCIsIFs0LCA2XV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCIwXCIsIG5hbWU6IFwidmFsdWVcIiwgaWQ6IFwiYXJyYXktMFwifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCIxXCIsIG5hbWU6IFwidmFsdWVcIiwgaWQ6IFwiYXJyYXktMVwifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCIyXCIsIG5hbWU6IFwidmFsdWVcIiwgaWQ6IFwiYXJyYXktMlwifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCIzXCIsIG5hbWU6IFwidmFsdWVcIiwgaWQ6IFwiYXJyYXktM1wifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCI0XCIsIG5hbWU6IFwidmFsdWVcIiwgaWQ6IFwiYXJyYXktNFwifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCI1XCIsIG5hbWU6IFwidmFsdWVcIiwgaWQ6IFwiYXJyYXktNVwifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCI2XCIsIG5hbWU6IFwidmFsdWVcIiwgaWQ6IFwiYXJyYXktNlwifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCI3XCIsIG5hbWU6IFwidmFsdWVcIiwgaWQ6IFwiYXJyYXktN1wifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCI4XCIsIG5hbWU6IFwidmFsdWVcIiwgaWQ6IFwiYXJyYXktOFwifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCI5XCIsIG5hbWU6IFwidmFsdWVcIiwgaWQ6IFwiYXJyYXktOVwifV0sXG4gICAgW1wiYWRkTGlua1wiLCBbXCJhcnJheVwiLCBcImFycmF5LTBcIl1dLFxuICAgIFtcImFkZExpbmtcIiwgW1wiYXJyYXlcIiwgXCJhcnJheS0xXCJdXSxcbiAgICBbXCJhZGRMaW5rXCIsIFtcImFycmF5XCIsIFwiYXJyYXktMlwiXV0sXG4gICAgW1wiYWRkTGlua1wiLCBbXCJhcnJheVwiLCBcImFycmF5LTNcIl1dLFxuICAgIFtcImFkZExpbmtcIiwgW1wiYXJyYXlcIiwgXCJhcnJheS00XCJdXSxcbiAgICBbXCJhZGRMaW5rXCIsIFtcImFycmF5XCIsIFwiYXJyYXktNVwiXV0sXG4gICAgW1wiYWRkTGlua1wiLCBbXCJhcnJheVwiLCBcImFycmF5LTZcIl1dLFxuICAgIFtcImFkZExpbmtcIiwgW1wiYXJyYXlcIiwgXCJhcnJheS03XCJdXSxcbiAgICBbXCJhZGRMaW5rXCIsIFtcImFycmF5XCIsIFwiYXJyYXktOFwiXV0sXG4gICAgW1wiYWRkTGlua1wiLCBbXCJhcnJheVwiLCBcImFycmF5LTlcIl1dLFxuICBdLFxuICBbXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDhdLFxuICBdLFxuICBbXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcImNyZWF0ZVRlbkVsZW1lbnRzXCJdLFxuICAgIFtcInJlbW92ZUxpbmtcIiwgW1wiY2FsbFN0YWNrXCIsIFwiY3JlYXRlVGVuRWxlbWVudHNcIl1dLFxuICAgIFtcInJlbW92ZUxpbmtcIiwgW1wiY3JlYXRlVGVuRWxlbWVudHNcIiwgXCJhcnJheVwiXV0sXG4gICAgW1wiYWRkTGlua1wiLCBbXCJ3aW5kb3dcIiwgXCJhcnJheVwiXV0sXG4gICAgW1wicmVuYW1lXCIsIFtcImFycmF5XCIsIFwibXlBcnJheVwiXV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIFtcIjExOjFcIiwgXCIxMToxMlwiXV1cbiAgXVxuXVxuIiwiZXhwb3J0cy5HUk9VUCA9IE9iamVjdC5mcmVlemUoe1xuICB3aW5kb3c6IDAsXG4gIGFycmF5OiAxLFxuICBvYmplY3Q6IDIsXG4gIGZ1bmN0aW9uOiAzLFxuICB2YWx1ZTogNCxcbiAgY2FsbFN0YWNrOiA1LFxufSlcblxuZXhwb3J0cy5TSVpFID0gT2JqZWN0LmZyZWV6ZSh7XG4gIHdpbmRvdzogNCxcbiAgY2FsbFN0YWNrOiAzLFxuICBmdW5jdGlvbjogMyxcbiAgYXJyYXk6IDIsXG4gIG9iamVjdDogMixcbiAgdmFsdWU6IDFcbn0pXG5cbmV4cG9ydHMuTEVOR1RIID0gT2JqZWN0LmZyZWV6ZSh7XG4gIHdpbmRvdzogMTAsXG4gIGNhbGxTdGFjazogMTAsXG4gIGZ1bmN0aW9uOiAxMCxcbiAgYXJyYXk6IDIsXG4gIG9iamVjdDogMixcbiAgdmFsdWU6IDAuM1xufSlcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gbmFtZSAoY29kZSkge1xuICBjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuZWRpdG9yJylcbiAgY29uc3QgZWRpdG9yID0gQ29kZU1pcnJvcihjb250YWluZXIsIHtcbiAgICB2YWx1ZTogY29kZSB8fCBcIi8vIE5vIGNvZGUgcHJvdmlkZWRcIixcbiAgICBtb2RlOiBcImphdmFzY3JpcHRcIixcbiAgICBsaW5lTnVtYmVyczogdHJ1ZVxuICB9KVxuICByZXR1cm4gZWRpdG9yXG59XG4iLCIvLyBjb25zdCB7IG5vZGVzLCBsaW5rcyB9ID0gcmVxdWlyZSgnLi9hY3Rpb25zL2RlbW8nKVxuY29uc3QgeyBHUk9VUCwgU0laRSwgTEVOR1RIIH0gPSByZXF1aXJlKCcuL2NvbnN0YW50cycpXG5jb25zdCBkZW1vID0gcmVxdWlyZSgnLi9hY3Rpb25zL2NyZWF0ZS10ZW4tZWxlbWVudHMnKVxuY29uc3QgYWN0aW9uU3RlcHBlciA9IHJlcXVpcmUoJy4vYWN0aW9uLXN0ZXBwZXInKVxuY29uc3Qgc3RhcnRFZGl0b3IgPSByZXF1aXJlKCcuL2VkaXRvcicpXG5cbjsoZnVuY3Rpb24oKSB7XG4gIGNvbnN0IGdyYXBoID0gbmV3IE1lbW9yeUdyYXBoKGRlbW8uc3RlcHMpXG4gIGdyYXBoLmVkaXRvciA9IHN0YXJ0RWRpdG9yKGRlbW8uY29kZSlcblxuICBzZXR1cEZvcmNlVGljayhncmFwaClcbiAgYWRkS2V5Ym9hcmRMaXN0ZW5lcihncmFwaClcbiAgYWRkUmVzaXplTGlzdGVuZXIoZ3JhcGguZm9yY2UsIGdyYXBoLmVsKVxufSkoKVxuXG5mdW5jdGlvbiBNZW1vcnlHcmFwaChzdGVwc0pzb24pIHtcbiAgY29uc3QgZWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcubm9kZScpXG4gIHRoaXMuZWwgPSBlbFxuICB0aGlzLnN2ZyA9IGQzLnNlbGVjdChcIi5ub2RlXCIpXG4gICAgLmFwcGVuZChcInN2Z1wiKVxuICAgIC5hdHRyKFwid2lkdGhcIiwgZWwub2Zmc2V0V2lkdGgpXG4gICAgLmF0dHIoXCJoZWlnaHRcIiwgZWwub2Zmc2V0SGVpZ2h0KVxuXG4gIHRoaXMuY29sb3IgPSBkMy5zY2FsZS5jYXRlZ29yeTIwKClcblxuICB0aGlzLmZvcmNlID0gZDMubGF5b3V0LmZvcmNlKClcbiAgICAgIC5ncmF2aXR5KDAuMDUpXG4gICAgICAuZGlzdGFuY2UoZCA9PiBTSVpFW2QudGFyZ2V0Lm5hbWVdICogNTApXG4gICAgICAuY2hhcmdlKC0xMDApXG4gICAgICAuc2l6ZShbZWwub2Zmc2V0V2lkdGgsIGVsLm9mZnNldEhlaWdodF0pXG5cbiAgdGhpcy4kbGluayA9IHRoaXMuc3ZnLmFwcGVuZChcImdcIikuc2VsZWN0QWxsKFwiLmxpbmtcIilcbiAgdGhpcy4kbm9kZSA9IHRoaXMuc3ZnLmFwcGVuZChcImdcIikuc2VsZWN0QWxsKFwiLm5vZGVcIilcbiAgdGhpcy5ub2RlcyA9IFtdXG4gIHRoaXMubGlua3MgPSBbXVxuICB0aGlzLnN0ZXBzSnNvbiA9IHN0ZXBzSnNvblxufVxuXG5mdW5jdGlvbiBydW5TdGVwKGdyYXBoLCBpKSB7XG4gIGdyYXBoLmVkaXRvci5nZXRBbGxNYXJrcygpLmZvckVhY2gobWFyayA9PiBtYXJrLmNsZWFyKCkpXG4gIGdyYXBoLnN0ZXBzSnNvbltpXS5mb3JFYWNoKChbYWN0aW9uLCB2YWx1ZV0pID0+IHtcbiAgICBhY3Rpb25TdGVwcGVyW2FjdGlvbl0oZ3JhcGgsIHZhbHVlKVxuICB9KVxufVxuXG5mdW5jdGlvbiBydW5TdGVwc1RvKGdyYXBoLCBpKSB7XG4gIGdyYXBoLm5vZGVzID0gW11cbiAgZ3JhcGgubGlua3MgPSBbXVxuICBmb3IobGV0IGo9MDsgaiA8PSBpOyBqKyspIHJ1blN0ZXAoZ3JhcGgsIGopXG59XG5cbmZ1bmN0aW9uIGFkZEtleWJvYXJkTGlzdGVuZXIoZ3JhcGgpIHtcbiAgY29uc3QgS0VZX1JJR0hUID0gMzlcbiAgY29uc3QgS0VZX0xFRlQgPSAzN1xuICBsZXQgY3VycmVudFN0ZXAgPSAwXG4gIGxldCB7bm9kZXMsIHN0ZXBzSnNvbiwgZm9yY2V9ID0gZ3JhcGhcblxuICBydW5TdGVwc1RvKGdyYXBoLCBjdXJyZW50U3RlcClcbiAgdXBkYXRlVmlldyhncmFwaClcblxuICAvLyBNb3ZlIHRoZSBncmFwaCBzdGVwIGxlZnQgb3IgcmlnaHQgYnkga2V5Ym9hcmRcbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXVwJywgZSA9PiB7XG4gICAgaWYoZS5rZXlDb2RlID09PSBLRVlfUklHSFQpIHtcbiAgICAgIGNvbnN0IG5leHRTdGVwID0gTWF0aC5taW4oY3VycmVudFN0ZXAgKyAxLCBzdGVwc0pzb24ubGVuZ3RoIC0gMSlcbiAgICAgIGlmIChuZXh0U3RlcCAhPT0gY3VycmVudFN0ZXApIHtcbiAgICAgICAgY3VycmVudFN0ZXAgPSBuZXh0U3RlcFxuICAgICAgICBydW5TdGVwKGdyYXBoLCBjdXJyZW50U3RlcClcbiAgICAgICAgdXBkYXRlVmlldyhncmFwaClcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYoZS5rZXlDb2RlID09PSBLRVlfTEVGVCkge1xuICAgICAgY29uc3QgbmV4dFN0ZXAgPSBNYXRoLm1heChjdXJyZW50U3RlcCAtIDEsIDApXG4gICAgICBpZiAobmV4dFN0ZXAgIT09IGN1cnJlbnRTdGVwKSB7XG4gICAgICAgIGN1cnJlbnRTdGVwID0gbmV4dFN0ZXBcbiAgICAgICAgcnVuU3RlcHNUbyhncmFwaCwgY3VycmVudFN0ZXApXG4gICAgICAgIHVwZGF0ZVZpZXcoZ3JhcGgpXG4gICAgICB9XG4gICAgfVxuICB9KVxufVxuXG5mdW5jdGlvbiBhZGRSZXNpemVMaXN0ZW5lciAoZm9yY2UsIGVsKSB7XG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCAoKSA9PiB7XG4gICAgZDMuc2VsZWN0KFwic3ZnXCIpXG4gICAgICAuYXR0cihcIndpZHRoXCIsIGVsLm9mZnNldFdpZHRoKVxuICAgICAgLmF0dHIoXCJoZWlnaHRcIiwgZWwub2Zmc2V0SGVpZ2h0KVxuXG4gICAgZm9yY2Uuc2l6ZShbZWwub2Zmc2V0V2lkdGgsIGVsLm9mZnNldEhlaWdodF0pXG4gIH0pXG59XG5cbmZ1bmN0aW9uIHVwZGF0ZVZpZXcoZ3JhcGgpIHtcbiAgY29uc3QgeyBmb3JjZSwgY29sb3IsIG5vZGVzLCBsaW5rcywgZWwgfSA9IGdyYXBoXG5cbiAgLy8gVXBkYXRlIHRoZSBncmFwaCdzIHNlbGVjdGlvbnMgd2l0aCB0aGUgY2hhbmdlZCBkYXRhXG4gIGNvbnN0ICRub2RlID0gZ3JhcGguJG5vZGUuZGF0YShub2RlcylcbiAgY29uc3QgJGxpbmsgPSBncmFwaC4kbGluay5kYXRhKGxpbmtzKVxuICBncmFwaC4kbm9kZSA9ICRub2RlXG4gIGdyYXBoLiRsaW5rID0gJGxpbmtcblxuICAvLyBVcGRhdGUgRE9NIG5vZGVzJyBiYXNlIGdyb3VwXG4gIGxldCBlbnRlciA9ICRub2RlLmVudGVyKCkuYXBwZW5kKFwiZ1wiKVxuICAkbGluay5lbnRlcigpLmFwcGVuZChcImxpbmVcIilcbiAgJG5vZGUuZXhpdCgpLnJlbW92ZSgpXG4gICRsaW5rLmV4aXQoKS5yZW1vdmUoKVxuICAkbm9kZS5odG1sKFwiXCIpXG5cbiAgJG5vZGUuYXR0cihcImNsYXNzXCIsIFwibm9kZVwiKVxuICAgIC5jYWxsKGZvcmNlLmRyYWcpXG5cbiAgJG5vZGUuYXBwZW5kKFwiY2lyY2xlXCIpXG4gICAgLmF0dHIoXCJjbGFzc1wiLCBcIm5vZGUtY2lyY2xlXCIpXG4gICAgLmF0dHIoXCJyXCIsIGQgPT4gNSAqIFNJWkVbZC5uYW1lXSlcbiAgICAuc3R5bGUoXCJmaWxsXCIsIGQgPT4gY29sb3IoR1JPVVBbZC5uYW1lXSkpXG5cbiAgJG5vZGUuYXBwZW5kKFwidGV4dFwiKVxuICAgIC5hdHRyKFwiZHhcIiwgZCA9PiA1ICsgNCAqIFNJWkVbZC5uYW1lXSlcbiAgICAuYXR0cihcImR5XCIsIFwiLjM1ZW1cIilcbiAgICAvLyBQcmlvcml0eSBvcmRlciBmb3IgdGV4dCBub2RlcywgYWxsb3cgdGhlbSB0byBiZSByZW5hbWVkLCBvciB1c2UgdGhlXG4gICAgLy8gZGlzcGxheSBuYW1lLiBJZiBub25lIG9mIHRob3NlIGV4aXN0IGp1c3QgdXNlIHRoZSBub2RlIG5hbWUgdHlwZS5cbiAgICAudGV4dChkID0+IGQucmVuYW1lIHx8IGQuZGlzcGxheSB8fCBkLm5hbWUpXG5cbiAgJGxpbmsuYXR0cihcImNsYXNzXCIsIFwibGlua1wiKVxuICAgICAgLmF0dHIoXCJzdHJva2UtZGFzaGFycmF5XCIsICh7ZGFzaGVkfSkgPT4gZGFzaGVkID8gXCI1LCA1XCIgOiBmYWxzZSlcblxuICAvLyBSZXN0YXJ0IGZvcmNlIGdyYXBoXG4gIGZvcmNlXG4gICAgLm5vZGVzKG5vZGVzKVxuICAgIC5saW5rcyhsaW5rcylcbiAgICAuZnJpY3Rpb24oMC44KVxuICAgIC5jaGFyZ2UoLTYwMClcbiAgICAuZ3Jhdml0eSgwLjEpXG4gICAgLmxpbmtEaXN0YW5jZShkID0+IHtcbiAgICAgIHJldHVybiBMRU5HVEhbZC50YXJnZXQubmFtZV0gKiBlbC5vZmZzZXRIZWlnaHQgLyA2MFxuICAgIH0pXG4gICAgLy8gLmxpbmtTdHJlbmd0aCgwLjAxKVxuICAgIC8vIC50aGV0YSgwLjgpXG4gICAgLy8gLmFscGhhKDAuMSlcbiAgICAuc3RhcnQoKVxufVxuXG5mdW5jdGlvbiBzZXR1cEZvcmNlVGljayAoZ3JhcGgpIHtcbiAgZ3JhcGguZm9yY2Uub24oXCJ0aWNrXCIsICgpID0+IHtcbiAgICBncmFwaC4kbm9kZS5hdHRyKFwidHJhbnNmb3JtXCIsIChkKSA9PiBgdHJhbnNsYXRlKCR7ZC54fSwke2QueX0pYClcbiAgICBncmFwaC4kbGluay5hdHRyKFwieDFcIiwgZCA9PiBkLnNvdXJjZS54KVxuICAgICAgICAuYXR0cihcInkxXCIsIGQgPT4gZC5zb3VyY2UueSlcbiAgICAgICAgLmF0dHIoXCJ4MlwiLCBkID0+IGQudGFyZ2V0LngpXG4gICAgICAgIC5hdHRyKFwieTJcIiwgZCA9PiBkLnRhcmdldC55KVxuICB9KVxufVxuIl19
