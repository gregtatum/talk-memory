var width = window.innerWidth,
    height = window.innerHeight

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

var svg = d3.select("body").append("svg")
    .attr("width", width)
    .attr("height", height)

var color = d3.scale.category20()

var force = d3.layout.force()
    .gravity(0.05)
    .distance(d => size[d.target.name] * 50)
    .charge(-100)
    .size([width, height])

nodes.forEach(n => {
  n.x = Math.random() * 100 + width / 2
  n.y = Math.random() * 100 + height / 2
})

force
    .nodes(nodes)
    .links(links)
    .start()

var link = svg.selectAll(".link")

var node = svg.selectAll(".node")

force.on("tick", function() {
  link.attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y)

  node.attr("transform", function(d) { return "translate(" + d.x + "," + d.y + ")" })
})

function update() {
  link = link.data(links)
  link.enter().append("line")
      .attr("class", "link")
  link.exit().remove()

  node = node.data(nodes)
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

  node.exit().remove()

  force.start()
}

update()

setTimeout(() => {
  nodes.push({name:"function"})
  links.push({source: 0, target: 7})
  update()
}, 1000)
