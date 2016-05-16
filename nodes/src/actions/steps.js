module.exports = [
  [ ["addNode", {name: "window", id: "window"}]
  ],
  [ ["addNode", {name: "array", id: "array"}],
    ["addLink", ["window", "array"]]
  ],
  [ ["addNode", {name: "value", id: "array-1"}],
    ["addNode", {name: "value", id: "array-2"}],
    ["addNode", {name: "value", id: "array-3"}],
    ["addNode", {name: "value", id: "array-4"}],
    ["addLink", ["array", "array-1"]],
    ["addLink", ["array", "array-2"]],
    ["addLink", ["array", "array-3"]],
    ["addLink", ["array", "array-4"]]
  ],
  [ ["addNode", {name: "function", id: "function"}],
    ["addLink", ["window", "function"]]
  ],
]
