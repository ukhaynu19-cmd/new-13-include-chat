// Filters a student <select> so it only lists students in the chosen class (and group, if that class has groups).
// students: array of {id, name, class, section}
// classSections: object like { "Six": [], "Nine": ["Science","Business Studies","Humanities"] }
function setupStudentFilterByClass(classSelectEl, sectionSelectEl, studentSelectEl, students, classSections, initialStudentId) {
  function renderGroups() {
    const groups = classSections[classSelectEl.value] || [];
    sectionSelectEl.innerHTML = '';
    if (groups.length === 0) {
      sectionSelectEl.style.display = 'none';
    } else {
      sectionSelectEl.style.display = '';
      groups.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g;
        opt.textContent = g;
        sectionSelectEl.appendChild(opt);
      });
    }
  }

  function renderStudents() {
    const cls = classSelectEl.value;
    const sec = sectionSelectEl.style.display === 'none' ? '' : sectionSelectEl.value;
    const filtered = students.filter(s => s.class === cls && (s.section || '') === sec);
    studentSelectEl.innerHTML = '';
    if (filtered.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No students in this class/group';
      studentSelectEl.appendChild(opt);
    } else {
      filtered.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.id + ' — ' + s.name;
        if (initialStudentId && s.id === initialStudentId) opt.selected = true;
        studentSelectEl.appendChild(opt);
      });
    }
  }

  classSelectEl.addEventListener('change', () => { renderGroups(); renderStudents(); });
  sectionSelectEl.addEventListener('change', renderStudents);
  renderGroups();
  renderStudents();
}
