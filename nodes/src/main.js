// const { nodes, links } = require('./actions/demo')
const { GROUP, SIZE } = require('./constants')
const demo = require('./actions/create-ten-elements')
const actionStepper = require('./action-stepper')

;(function() {
  const graph = new MemoryGraph(demo)
  setupForceTick(graph)
  addKeyboardListener(graph)
  addResizeListener(graph.force)
})()

function MemoryGraph(stepsJson) {
  this.svg = d3.select("body")
    .append("svg")
    .attr("width", window.innerWidth)
    .attr("height", window.innerHeight)

  this.color = d3.scale.category20()

  this.force = d3.layout.force()
      .gravity(0.05)
      .distance(d => SIZE[d.target.name] * 50)
      .charge(-100)
      .size([window.innerWidth, window.innerHeight])

  this.$link = this.svg.append("g").selectAll(".link")
  this.$node = this.svg.append("g").selectAll(".node")
  this.nodes = []
  this.links = []
  this.stepsJson = stepsJson
}

function runStep({stepsJson, nodes, links}, i) {
  stepsJson[i].forEach(([action, value]) => {
    actionStepper[action](nodes, links, value)
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

function addResizeListener (force) {
  window.addEventListener('resize', () => {
    d3.select("svg")
      .attr("width", window.innerWidth)
      .attr("height", window.innerHeight)

    force.size([window.innerWidth, window.innerHeight])
  })
}

function updateView(graph) {
  const { force, color, nodes, links } = graph

  // Remove all elements
  // graph.$node.children().remove()
  // graph.$link.children().remove()

  // Update the graph's selections with the changed data
  const $node = graph.$node.data(nodes)
  const $link = graph.$link.data(links)
  graph.$node = $node
  graph.$link = $link

  // Update DOM nodes' base group
  $node.enter().append("g")
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
    .text(d => d.display === undefined ? d.name : d.display)

  $link.attr("class", "link")
      .attr("stroke-dasharray", ({dashed}) => dashed ? "5, 5" : false)

  // Restart force graph
  force
    .nodes(nodes)
    .links(links)
    .friction(0.8)
    .charge(-30)
    // .linkStrength(0.1)
    // .linkDistance(window.innerHeight / 10)
    // .gravity(0.1)
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
