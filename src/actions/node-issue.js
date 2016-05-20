module.exports = [
  [
    ["addNode", {type: "window", id: "window"}],
    ["addNode", {type: "callStack", id: "callStack"}],
    ["addLink", ["window", "callStack", "dashed"]],
  ],
  [
    ["addNode", {display: "createTenElements()", type: "function", id: "createTenElements()"}],
    ["addLink", ["callStack", "createTenElements()"]],
  ],
  [
    ["addNode", {type: "array", id: "array"}],
    ["addLink", ["createTenElements()", "array"]],
  ],
  [
    ["removeNode", "createTenElements()"],
    ["removeLink", ["callStack", "createTenElements()"]],
    ["removeLink", ["createTenElements()", "array"]]
  ]
]
