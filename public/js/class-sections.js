// Syncs a "group/section" <select> to match whatever the selected class allows.
// classSections is an object like { "Six": [], "Nine": ["Science","Business Studies","Humanities"] }
function setupClassSectionSync(classSelectEl, sectionSelectEl, classSections, currentValue) {
  function render() {
    const groups = classSections[classSelectEl.value] || [];
    sectionSelectEl.innerHTML = '';
    if (groups.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No group (Class ' + classSelectEl.value + ')';
      sectionSelectEl.appendChild(opt);
      // sectionSelectEl.disabled = true;  // removed so section still submits as ""
    } else {
      sectionSelectEl.disabled = false;
      groups.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g;
        opt.textContent = g;
        if (currentValue && g === currentValue) opt.selected = true;
        sectionSelectEl.appendChild(opt);
      });
    }
  }
  classSelectEl.addEventListener('change', render);
  render();
}