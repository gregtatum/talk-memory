exports.code = `// Associate the text content of a div with a key.

var id = "myElement";
var div = document.getElementById(id);

var object = {};
object[id] = div.textContent;

console.log(object.myElement);
console.log(object[id]);

var map = new Map();
map.set(id, div.textContent);
map.set(div, div.textContent);

console.log(map.get(div));
console.log(map.get(id));
`

exports.steps = [
  [],
  [
    ["highlight", [3,4]],
  ],
  [
    ["highlight", [6,7]],
  ],
  [
    ["highlight", [9,10]],
  ],
  [
    ["highlight", [12,14]],
  ],
  [
    ["highlight", [16,17]],
  ]
]
