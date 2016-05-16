module.exports = [
  [
    ["addNode", {name: "window", id: "window"}],
    ["addNode", {name: "callStack", id: "callStack"}],
    ["addLink", ["window", "callStack", "dashed"]],
  ],
  [
    ["addNode", {display: "createTenElements()", name: "function", id: "createTenElements()"}],
    ["addLink", ["callStack", "createTenElements()"]],
  ],
  [
    ["addNode", {name: "array", id: "array"}],
    ["addLink", ["createTenElements()", "array"]],
  ],
  [
    ["removeNode", "createTenElements()"],
    ["removeLink", ["callStack", "createTenElements()"]],
    ["removeLink", ["createTenElements()", "array"]]
  ]
]
