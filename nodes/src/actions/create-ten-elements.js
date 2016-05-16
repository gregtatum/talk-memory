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
