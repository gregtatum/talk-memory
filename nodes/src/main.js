const { GROUP, SIZE } = require('./constants')
const { nodes, links } = require('./actions/demo')

function setupD3() {
  var svg = d3.select("body")
    .append("svg")
    .attr("width", window.innerWidth)
    .attr("height", window.innerHeight)

  var color = d3.scale.category20()

  var force = d3.layout.force()
      .gravity(0.05)
      .distance(d => SIZE[d.target.name] * 50)
      .charge(-100)
      .size([window.innerWidth, window.innerHeight])

  var link = svg.selectAll(".link")
  var node = svg.selectAll(".node")

  return { svg, color, force, link, node }
}

function filterActiveLinks(nodes, links) {
  return links
    .filter(l => {
      return nodes.reduce((memo, n, i) => {
        return memo || l.source === i || l.source === n
      }, false)
    })
    .filter(l => {
      return nodes.reduce((memo, n, i) => {
        return memo || l.target === i || l.target === n
      }, false)
    })
}

function addEventListeners(step, {nodes, force}) {
  var KEY_RIGHT = 39
  var KEY_LEFT = 37
  var nodePosition = 2

  window.addEventListener('keyup', e => {
    if(e.keyCode === KEY_RIGHT) nodePosition += 1
    if(e.keyCode === KEY_LEFT) nodePosition -= 1

    nodePosition = Math.max(0, nodePosition)
    nodePosition = Math.min(nodes.length, nodePosition)

    step(nodePosition);
  })

  window.addEventListener('resize', () => {
    d3.select("svg")
      .attr("width", window.innerWidth)
      .attr("height", window.innerHeight)

    force.size([window.innerWidth, window.innerHeight])
  })
}

function stepFn(nodes, current) {
  return function step(i) {
    const activeNodes = nodes.slice(0, i)
    const activeLinks = filterActiveLinks(activeNodes, deepCopyLinks(links))

    current.node = current.node.data(activeNodes)
    const g = current.node.enter().append("g")
    g.attr("class", "node")
      .call(current.force.drag)

    g.append("circle")
      .attr("class", "node-circle")
      .attr("r", d => 5 * SIZE[d.name])
      .style("fill", d => current.color(GROUP[d.name]))

    g.append("text")
      .attr("dx", d => 5 + 4 * SIZE[d.name])
      .attr("dy", ".35em")
      .text(d => d.display === undefined ? d.name : d.display)

    current.link = current.link.data(activeLinks)
    current.link.enter().append("line")
        .attr("class", "link")

    current.node.exit().remove()
    current.link.exit().remove()

    // Restart force graph
    current.force
      .nodes(activeNodes)
      .links(activeLinks)
      .start()
  }
}

function deepCopyLinks(list) {
 return list.map(l => Object.assign({}, l))
}

function setupUpdate (current) {
  current.force.on("tick", () => {
    current.node.attr("transform", (d) => `translate(${d.x},${d.y})`)
    current.link.attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y)
  })
}

function main() {
  const current = setupD3()
  const { svg, color, force, link, node } = current
  setupUpdate(current)
  const step = stepFn(nodes, current)
  addEventListeners(step, { nodes, force })
}

main();
