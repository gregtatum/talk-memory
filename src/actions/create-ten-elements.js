exports.code = `function createTenElements() {
  var array = [];

  for(var i=0; i < 10; i++) {
    array[i] = i;
  }
}

createTenElements();
`

exports.steps = [
  [
    ["addNode", {type: "window", id: "window"}],
    ["addNode", {type: "callStack", id: "callStack"}],
    // ["addLink", {source: "window", target: "callStack", dashed: true}],
  ],
  [
    ["highlight", [1, 7]]
  ],
  [
    ["addNode", {display: "scope", type: "function", id: "createTenElements"}],
    ["addLink", {source: "callStack", target: "createTenElements", display: "createTenElements"}],
    ["highlight", 9]
  ],
  [
    ["addNode", {display: "[ ]", type: "array", id: "array"}],
    ["addLink", {display: "array", source: "createTenElements", target: "array"}],
    ["highlight", ["2:3", "2:18"]],
  ],
  [
    ["highlight", [4, 6]],
    ["addNode", {display: " ", type: "value", id: "array-0"}],
    ["addNode", {display: " ", type: "value", id: "array-1"}],
    ["addNode", {display: " ", type: "value", id: "array-2"}],
    ["addNode", {display: " ", type: "value", id: "array-3"}],
    ["addNode", {display: " ", type: "value", id: "array-4"}],
    ["addNode", {display: " ", type: "value", id: "array-5"}],
    ["addNode", {display: " ", type: "value", id: "array-6"}],
    ["addNode", {display: " ", type: "value", id: "array-7"}],
    ["addNode", {display: " ", type: "value", id: "array-8"}],
    ["addNode", {display: " ", type: "value", id: "array-9"}],
    ["addLink", {display: "0", distance: 0.1, source: "array", target: "array-0"}],
    ["addLink", {display: "1", distance: 0.1, source: "array", target: "array-1"}],
    ["addLink", {display: "2", distance: 0.1, source: "array", target: "array-2"}],
    ["addLink", {display: "3", distance: 0.1, source: "array", target: "array-3"}],
    ["addLink", {display: "4", distance: 0.1, source: "array", target: "array-4"}],
    ["addLink", {display: "5", distance: 0.1, source: "array", target: "array-5"}],
    ["addLink", {display: "6", distance: 0.1, source: "array", target: "array-6"}],
    ["addLink", {display: "7", distance: 0.1, source: "array", target: "array-7"}],
    ["addLink", {display: "8", distance: 0.1, source: "array", target: "array-8"}],
    ["addLink", {display: "9", distance: 0.1, source: "array", target: "array-9"}],
  ],
  [
    ["removeNode", "createTenElements"],
  ],
  [
    ["removeNode", "array"],
    ["removeNode", "array-0"],
    ["removeNode", "array-1"],
    ["removeNode", "array-2"],
    ["removeNode", "array-3"],
    ["removeNode", "array-4"],
    ["removeNode", "array-5"],
    ["removeNode", "array-6"],
    ["removeNode", "array-7"],
    ["removeNode", "array-8"],
    ["removeNode", "array-9"],
  ]
]
