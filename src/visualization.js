const { GROUP, SIZE, LENGTH } = require('./constants')
const actionStepper = require('./action-stepper')
const startEditor = require('./editor')

// const { nodes, links } = require('./actions/demo')
// const demo = require('./actions/basics')
// const demo = require('./actions/create-ten-elements')
// const demo = require('./actions/handler-leak')
// const demo = require('./actions/handler-leak-fix')

module.exports = function start(demo) {
  const graph = new MemoryGraph(demo)

  startEditor(graph, demo.code)
  setupForceTick(graph),
  addKeyboardListener(graph),
  addResizeListener(graph, graph.force, graph.el)

  return () => {
    console.log('destroying visualization')
    graph.destroy.forEach(fn => fn())
  }
}

function MemoryGraph({steps, lineLength}) {
  const el = document.querySelector('.node')
  this.el = el
  this.svg = d3.select(".node")
    .append("svg")
    .attr("width", el.offsetWidth)
    .attr("height", el.offsetHeight)

  this.svg
    .append("defs")
      .append("marker")
        .attr("id", "arrow")
        .attr("markerWidth", "13")
        .attr("markerHeight", "13")
        .attr("orient", "auto")
        .attr("refX", "2")
        .attr("refY", "6")
        .append("path")
          .attr("d", "M2,2 L2,11 L10,6 L2,2")
          .style("fill", "#ccc")


  this.color = d3.scale.category20()

  this.lineLength = lineLength || 50
  this.force = d3.layout.force()
      .gravity(0.05)
      .distance(d => SIZE[d.target.type] * 50)
      .charge(-100)
      .size([el.offsetWidth, el.offsetHeight])

  this.$link = this.svg.append("g").selectAll(".link")
  this.$node = this.svg.append("g").selectAll(".node")
  this.nodes = []
  this.links = []
  this.stepsJson = steps
  this.destroy = [() => {
    this.svg.remove()
    this.force.stop()
  }]
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

  const handler = e => {
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
  }
  // Move the graph step left or right by keyboard
  window.addEventListener('keyup', handler)
  graph.destroy.push(() => window.removeEventListener('keyup', handler))
}

function addResizeListener (graph, force, el) {
  const handler = () => {
    d3.select("svg")
      .attr("width", el.offsetWidth)
      .attr("height", el.offsetHeight)

    force.size([el.offsetWidth, el.offsetHeight])
  }
  window.addEventListener('resize', handler)
  graph.destroy.push(() => window.removeEventListener('resize', handler))
}

function getNodeRadius (node) {
  return 5 * SIZE[node.type]
}

function updateView(graph) {
  const { force, color, nodes, links, el, lineLength } = graph

  // Update the graph's selections with the changed data
  const $node = graph.$node.data(nodes)
  const $link = graph.$link.data(links)
  graph.$node = $node
  graph.$link = $link

  // Update DOM nodes' base group
  $node.enter().append("g")
  $link.enter().append("g")
  $node.exit().remove()
  $link.exit().remove()
  $node.html("")
  $link.html("")

  $node.attr("class", "node")
    .call(force.drag)

  $node.append("circle")
    .attr("class", "node-circle")
    .attr("r", d => getNodeRadius(d))
    .style("fill", d => color(GROUP[d.type]))

  $node.append("text")
    .attr("class", "node-text")
    .attr("dx", d => 5 + 4 * SIZE[d.type])
    .attr("dy", ".35em")
    .style("fill", d => color(GROUP[d.type]))
    // Priority order for text nodes, allow them to be renamed, or use the
    // display name. If none of those exist just use the node name type.
    .text(d => d.rename || d.display || d.type)

  $link.append("line")
    .attr("class", "link")
    .attr("stroke-dasharray", ({dashed}) => dashed ? "5, 5" : false)
    .style("marker-end", "url(#arrow)")

  $link.append("text")
    .attr("class", "edge-text")
    .attr("dy", "-.35em")
    .text(d => d.rename || d.display || "")

  // Restart force graph
  force
    .nodes(nodes)
    .links(links)
    .friction(0.8)
    .charge(-600)
    .gravity(0.1)
    .linkDistance(d => {
      return LENGTH[d.target.type] * el.offsetHeight / 60 + lineLength * (d.distance || 1)
    })
    // .linkStrength(0.01)
    // .theta(0.8)
    // .alpha(0.1)
    .start()
}

function shortenLinks(link, first) {
  const ARROW_OFFSET = 8
  let radius = getNodeRadius(link.target)
  let x = link.target.x - link.source.x
  let y = link.target.y - link.source.y
  let distance = Math.sqrt(x*x + y*y)
  let theta = Math.atan2(y,x)
  if(first) {
    return link.source.x + Math.cos(theta) * (distance - radius - ARROW_OFFSET)
  } else {
    return link.source.y + Math.sin(theta) * (distance - radius - ARROW_OFFSET)
  }
}

function setupForceTick (graph) {
  graph.force.on("tick", () => {
    graph.$node.attr("transform", (d) => `translate(${d.x},${d.y})`)
    graph.$link.select('line')
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => shortenLinks(d, true))
      .attr("y2", d => shortenLinks(d, false))

    graph.$link.select('text')
      .style("transform", d => {
        let x = (d.source.x + d.target.x) / 2
        let y = (d.source.y + d.target.y) / 2
        let dx = d.target.x - d.source.x
        let dy = d.target.y - d.source.y
        let theta = Math.atan2(dy,dx)
        return `translate(${x}px, ${y}px) rotate(${theta}rad)`
      })
  })
}
