exports.nodes = [
  {name:"window"}, //0
  {name:"array"}, //1
  {name:"value", display: 0}, //2
  {name:"value", display: 1}, //3
  {name:"value", display: 2}, //4
  {name:"value", display: 3}, //5
  {name:"function"}, //6
]

exports.links = [
  {source: 0, target: 1},
  {source: 1, target: 2},
  {source: 1, target: 3},
  {source: 1, target: 4},
  {source: 1, target: 5},
  {source: 0, target: 6},
  {source: 6, target: 1},
]
