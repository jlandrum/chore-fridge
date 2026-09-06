// Retain element identity while updating, removing, and reordering keyed items.
export function updateList(container, items, tag, model = (item) => item) {
  const existing = new Map([...container.children].map((node) => [node.dataset.key, node]));
  items.forEach((item, index) => {
    let node = existing.get(item.id);
    if (node) existing.delete(item.id);
    else {
      node = document.createElement(tag);
      node.dataset.key = item.id;
    }
    node.model = model(item, index);
    if (node.update) node.update();
    if (container.children[index] !== node) container.insertBefore(node, container.children[index] || null);
  });
  for (const node of existing.values()) node.remove();
}
