/**
 * Run a step of modifying a node graph. This takes a JSON structure as can
 * be seen in the src/actions folder that then defines how to modify the node
 * graph.
 */

const NODE_SPREAD = 0.01

exports.addNode = function ({el, nodes, links}, node) {
  // Allow nodes to be renamed later on, but always revert when re-adding.
  if(node.rename) {
    node.rename = ""
  }

  // Nodes tend to be funky with the force layout when incrementally added.
  // Place them near the center randomly to aid in the layout on the screen.
  if(node.x === undefined) {
    const w = el.offsetWidth
    const h = el.offsetHeight / 2
    node.x = w / 2 + (Math.random() * w - w / 2) * NODE_SPREAD
    node.y = h / 2 + (Math.random() * h - h / 2) * NODE_SPREAD
  }
  nodes.push(node)
},

exports.rename = function ({nodes, links}, [id, value]) {
  const node = nodes.find(n => n.id === id)
  if (!node) throw new Error("Could not find that node to remove.")
  node.rename = value
},

exports.addLink = function ({nodes, links}, [sourceId, targetId, dashed]) {
  const source = nodes.find(({id}) => id === sourceId)
  const target = nodes.find(({id}) => id === targetId)
  if(!source || !target) {
    throw new Error("Could not find those nodes to link.")
  }
  links.push({source, target, dashed: Boolean(dashed)})
},

exports.removeNode = function ({nodes, links}, id) {
  const node = nodes.find(n => n.id === id)
  if (!node) throw new Error("Could not find that node to remove.")
  nodes.splice(nodes.indexOf(node), 1)
},

exports.removeLink = function ({nodes, links}, [sourceId, targetId]) {
  const link = links.find(({source, target}) => {
    return source.id === sourceId && target.id === targetId
  })
  if (!link) throw new Error("Could not find that link to remove.")
  links.splice(links.indexOf(link), 1)
}

exports.highlight = function ({editor}, value) {

  let [start, end] = Array.isArray(value) ? value : [value, value]
  let [startLine, startCh] = String(start).split(':')
  let [endLine, endCh] = String(end).split(':')

  if(!endCh) {
    endLine++
  }
  startCh = Math.max(0, startCh-1)
  endCh = Math.max(0, endCh-1)

  editor.markText(
    {line: startLine - 1, ch: startCh || 0},
    {line: endLine - 1, ch: endCh || 0},
    {
      className: "highlighted-line"
    }
  )
}
