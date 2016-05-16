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
