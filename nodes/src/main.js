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

  force.on("tick",() => {
    node.attr("transform", (d) => `translate(${d.x},"${d.y})`)
    link.attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y)
  })

  var link = svg.selectAll(".link")
  var node = svg.selectAll(".node")

  return { svg, color, force, link, node }
}

function filterActiveLinks(nodes, links) {
  links
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

  return linkParentMatches
}

function addEventListeners({nodes, force}) {
  var KEY_RIGHT = 39
  var KEY_LEFT = 37
  var nodePosition = 2

  window.addEventListener('keyup', e => {
    if(e.keyCode === KEY_RIGHT) nodePosition += 1
    if(e.keyCode === KEY_LEFT) nodePosition -= 1

    nodePosition = Math.max(0, nodePosition)
    nodePosition = Math.min(nodes.length, nodePosition)

    update(nodePosition);
  })

  window.addEventListener('resize', () => {
    d3.select("svg")
      .attr("width", window.innerWidth)
      .attr("height", window.innerHeight)

    force.size([window.innerWidth, window.innerHeight])
  })
}

function updateFn({nodes}) {
  return function update(i) {
    const activeNodes = nodes.slice(0, i)
    const activeLinks = filterActiveLinks(activeNodes, deepCopyLinks(links))

    node = node.data(activeNodes)
    const g = node.enter().append("g")
    g.attr("class", "node")
      .call(force.drag)

    g.append("circle")
      .attr("class", "node-circle")
      .attr("r", d => 5 * SIZE[d.name])
      .style("fill", d => color(GROUP[d.name]))

    g.append("text")
      .attr("dx", d => 5 + 4 * SIZE[d.name])
      .attr("dy", ".35em")
      .text(d => d.display === undefined ? d.name : d.display)

    link = link.data(activeLinks)
    link.enter().append("line")
        .attr("class", "link")

    node.exit().remove()
    link.exit().remove()

    // Restart force graph
    force
      .nodes(activeNodes)
      .links(activeLinks)
      .start()
  }
}

function main() {
  const { svg, color, force, link, node } = setupD3()
  addEventListeners({ nodes, force })
  const update = updateFn()
}

main();
