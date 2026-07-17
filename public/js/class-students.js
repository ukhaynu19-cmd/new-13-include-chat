// Filters a student <select> to only show students in the currently selected class.
// allStudents is an array like [{ id, name, class, section }]
function setupClassStudentSync(classSelectEl, studentSelectEl, allStudents, currentValue) {
  function render() {
    const list = allStudents.filter(s => s.class === classSelectEl.value);
    studentSelectEl.innerHTML = '';
    if (list.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No students in this class yet';
      studentSelectEl.appendChild(opt);
    } else {
      list.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.id + ' — ' + s.name + (s.section ? ' (' + s.section + ')' : '');
        if (currentValue && s.id === currentValue) opt.selected = true;
        studentSelectEl.appendChild(opt);
      });
    }
  }
  classSelectEl.addEventListener('change', render);
  render();
}
