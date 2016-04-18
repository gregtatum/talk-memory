var group = {
  window: 0,
  array: 1,
  object: 2,
  function: 3,
  value: 4
}
var size = {
  window: 4,
  function: 3,
  array: 2,
  object: 2,
  value: 1
}
var nodes = [
  {name:"window"}, //0
  {name:"array"}, //1
  {name:"value", display: 0}, //2
  {name:"value", display: 1}, //3
  {name:"value", display: 2}, //4
  {name:"value", display: 3}, //5
  {name:"function"}, //6
]
var links = [
  {source: 0, target: 1},
  {source: 1, target: 2},
  {source: 1, target: 3},
  {source: 1, target: 4},
  {source: 1, target: 5},
  {source: 0, target: 6},
  {source: 6, target: 1},
]

function deepCopyLinks(list) {
  return list.map(l => Object.assign({}, l))
}

var svg = d3.select("body").append("svg")
  .attr("width", window.innerWidth)
  .attr("height", window.innerHeight)

window.addEventListener('resize', () => {
  d3.select("svg")
    .attr("width", window.innerWidth)
    .attr("height", window.innerHeight)

  force.size([window.innerWidth, window.innerHeight])
})

var color = d3.scale.category20()

var force = d3.layout.force()
    .gravity(0.05)
    .distance(d => size[d.target.name] * 50)
    .charge(-100)
    .size([window.innerWidth, window.innerHeight])

nodes.forEach(n => {
  n.x = Math.random() * 100 + window.innerWidth / 2
  n.y = Math.random() * 100 + window.innerHeight / 2
})

var link = svg.selectAll(".link")

var node = svg.selectAll(".node")

force.on("tick", function() {
  link.attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y)

  node.attr("transform", function(d) { return "translate(" + d.x + "," + d.y + ")" })
})

function filterActiveLinks(nodes, links) {
  console.log('filterActiveLinks');
  console.table(links)

  var linkSourceMatches = links.filter(l => {
    return nodes.reduce((memo, n, i) => {
      return memo || l.source === i || l.source === n
    }, false)
  })

  var linkParentMatches = linkSourceMatches.filter(l => {
    return nodes.reduce((memo, n, i) => {
      return memo || l.target === i || l.target === n
    }, false)
  })

  console.table(linkParentMatches)
  return linkParentMatches
}


function update(i) {
  console.log('update')
  console.table(links)

  let activeNodes = nodes.slice(0,i)
  let activeLinks = filterActiveLinks(activeNodes, deepCopyLinks(links))

  console.log('after filter')
  console.table(links)

  node = node.data(activeNodes)
  let g = node.enter().append("g")
  g.attr("class", "node")
   .call(force.drag)


  g.append("circle")
    .attr("class", "node-circle")
    .attr("r", (d) => 5 * size[d.name])
    .style("fill", (d) => color(group[d.name]))

  g.append("text")
    .attr("dx", (d) => 5 + 4 * size[d.name])
    .attr("dy", ".35em")
    .text(d => d.display === undefined ? d.name : d.display)

  link = link.data(activeLinks)
  link.enter().append("line")
      .attr("class", "link")
  link.exit().remove()

  node.exit().remove()

  force
    .nodes(activeNodes)
    .links(activeLinks)
    .start()
}

update(2)
console.log('main')
console.table(links)

;(function() {
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
})()
