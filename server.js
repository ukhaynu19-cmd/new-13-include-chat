require('dotenv').config();
const { Student, Teacher, Guardian, Attendance, Routine, Fee, Exam, Result, Admin, PushSubscription, GroupMessage, PrivateMessage } = require('./models');
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const webpush = require('web-push');
// ... other imports

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB and start server only upon success
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB Atlas!');
    app.listen(PORT, () => {
      console.log(`🚀 School ERP running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Database connection error:', err);
    process.exit(1);
  });
// ... rest of your code

webpush.setVapidDetails(
  'mailto:ukhaynu19@gmail.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Class name -> two-digit class number, used for auto-generated Student IDs (HAC-YYYYCCRR)
const CLASS_NUMBERS = { Six: '06', Seven: '07', Eight: '08', Nine: '09', Ten: '10' };
const WHATSAPP_NUMBER = '8801521205096'; // 01521205096 in international format for wa.me links
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}`;
// Sections available per class — customize as needed (e.g. Nine: ['Science','Commerce','Arts'])
const CLASS_SECTIONS = {
  Six: [],
  Seven: [],
  Eight: [],
  Nine: ['Science', 'Business Studies', 'Humanities'],
  Ten: ['Science', 'Business Studies', 'Humanities']
};

// Sends a push notification to every device a given student has subscribed on.
// Automatically removes subscriptions that are no longer valid.
async function sendPushToStudent(studentId, title, body, url = '/student') {
  try {
    const subs = await PushSubscription.find({ studentId });
    const payload = JSON.stringify({ title, body, url });

    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification(s.subscription, payload);
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await PushSubscription.deleteOne({ _id: s._id });
        } else {
          console.error('Push send error:', err.message);
        }
      }
    }));
  } catch (err) {
    console.error('sendPushToStudent error:', err);
  }
}

// Builds the full "db" object every admin page expects
async function buildAdminDb() {
  const [students, teachers, fees, examRoutines, attendance, results, routines, admin] = await Promise.all([
    Student.find({}),
    Teacher.find({}),
    Fee.find({}),
    Exam.find({}),
    Attendance.find({}),
    Result.find({}),
    Routine.find({}),
    Admin.findOne({})
  ]);
  return {
    students, teachers, fees, examRoutines, attendance, results, routines,
    admin: admin || { username: process.env.ADMIN_USER || 'admin' },
    classes: Object.keys(CLASS_NUMBERS),
    classSections: CLASS_SECTIONS
  };
}
function generateStudentId(year, cls, roll) {
  const classNum = CLASS_NUMBERS[cls] || '00';
  const rollPadded = String(roll).padStart(2, '0');
  return `HAC-${year}${classNum}${rollPadded}`;
}

// Make the WhatsApp link available in every view without passing it manually each time
app.use((req, res, next) => {
  res.locals.whatsappLink = WHATSAPP_LINK;
  next();
});

const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'school-erp-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }
}));

function requireAdmin(req, res, next) {
  if (req.session.role === 'admin') return next();
  return res.redirect('/');
}
function requireStudent(req, res, next) {
  if (req.session.role === 'student') return next();
  return res.redirect('/');
}
function requireGuardian(req, res, next) {
  if (req.session.role === 'guardian') return next();
  return res.redirect('/');
}
function requireTeacher(req, res, next) {
  if (req.session.role === 'teacher') return next();
  return res.redirect('/');
}
function requireAnyRole(req, res, next) {
  if (['student', 'teacher', 'admin'].includes(req.session.role)) return next();
  return res.status(403).json({ error: 'Unauthorized' });
}

function computeAttendanceStats(records) {
  const present = records.filter(r => r.status === 'Present').length;
  const absent = records.filter(r => r.status === 'Absent').length;
  const marked = present + absent;
  const percent = marked > 0 ? Math.round((present / marked) * 100) : 0;
  return { present, absent, percent, records };
}

// Gathers everything a student's or guardian's pages need, in one place
async function buildStudentData(studentId) {
  const student = await Student.findOne({ id: studentId });
  if (!student) return null;

  const [attendanceRecords, routine, examRoutine, allResults, fees] = await Promise.all([
    Attendance.find({ studentId }),
    Routine.find({ class: student.class, section: student.section }),
    Exam.find({ class: student.class, section: student.section }),
    Result.find({ studentId }),
    Fee.find({ studentId })
  ]);

  const attendance = computeAttendanceStats(attendanceRecords);
  const today = new Date().toISOString().slice(0, 10);
  const results = allResults.filter(r => !r.publishDate || r.publishDate <= today);

  return { student, attendance, routine, examRoutine, results, fees };
}

// ---------- LOGIN ----------
app.get('/', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login/admin', (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASSWORD) {
    req.session.role = 'admin';
    return res.redirect('/admin');
  }
  res.render('login', { error: 'Invalid admin credentials' });
});

app.post('/login/student', async (req, res) => {
  try {
    const { studentId, password } = req.body;

    const student = await Student.findOne({ id: studentId, password: password });

    if (student) {
      req.session.role = 'student';
      req.session.studentId = student.id;
      return res.redirect('/student');
    }

    res.render('login', { error: 'Invalid Student ID or password' });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).send("Database error during login");
  }
});

app.post('/login/teacher', async (req, res) => {
  try {
    const { teacherId, password } = req.body;
    const teacher = await Teacher.findOne({ id: teacherId, password: password });
    if (teacher) {
      req.session.role = 'teacher';
      req.session.teacherId = teacher.id;
      return res.redirect('/teacher');
    }
    res.render('login', { error: 'Invalid Teacher ID or password' });
  } catch (err) { res.status(500).send("Login error"); }
});

app.post('/login/guardian', async (req, res) => {
  try {
    const { guardianId, password } = req.body;
    const guardian = await Guardian.findOne({ id: guardianId, password: password });
    if (guardian) {
      req.session.role = 'guardian';
      req.session.guardianId = guardian.id;
      req.session.studentId = guardian.studentIds && guardian.studentIds[0];
      return res.redirect('/guardian');
    }
    res.render('login', { error: 'Invalid Guardian ID or password' });
  } catch (err) { res.status(500).send("Login error"); }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ---------- PUSH NOTIFICATIONS ----------
// Placed AFTER session middleware so req.session works correctly here.

app.get('/push/vapid-public-key', (req, res) => {
  res.send(process.env.VAPID_PUBLIC_KEY);
});

app.post('/student/push/subscribe', requireStudent, async (req, res) => {
  try {
    const subscription = req.body;
    const existing = await PushSubscription.findOne({
      studentId: req.session.studentId,
      'subscription.endpoint': subscription.endpoint
    });
    if (!existing) {
      await PushSubscription.create({ studentId: req.session.studentId, subscription });
    }
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('Subscribe error:', err);
    res.status(500).json({ ok: false });
  }
});

// ---------- GROUP CHAT (one global chat — students, teachers, admin) ----------

app.get('/student/chat', requireStudent, async (req, res) => {
  try {
    const student = await Student.findOne({ id: req.session.studentId });
    const messages = await GroupMessage.find({}).sort({ createdAt: 1 }).limit(200);
    res.render('student/chat', { student, messages, page: 'chat' });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.get('/teacher/chat', requireTeacher, async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ id: req.session.teacherId });
    const messages = await GroupMessage.find({}).sort({ createdAt: 1 }).limit(200);
    res.render('teacher/chat', { teacher, messages, page: 'chat' });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.get('/admin/chat', requireAdmin, async (req, res) => {
  try {
    const db = await buildAdminDb();
    const messages = await GroupMessage.find({}).sort({ createdAt: 1 }).limit(200);
    res.render('admin/chat', { db, messages, page: 'chat' });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

// AJAX polling endpoint — returns messages newer than ?since=<ISO date>
app.get('/chat/group/messages', requireAnyRole, async (req, res) => {
  try {
    const since = req.query.since;
    const filter = since ? { createdAt: { $gt: new Date(since) } } : {};
    const messages = await GroupMessage.find(filter).sort({ createdAt: 1 }).limit(200);
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/chat/group/send', requireAnyRole, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Empty message' });

    let senderName = '';
    let senderId = '';

    if (req.session.role === 'student') {
      const student = await Student.findOne({ id: req.session.studentId });
      senderName = student ? student.name : 'Student';
      senderId = req.session.studentId;
    } else if (req.session.role === 'teacher') {
      const teacher = await Teacher.findOne({ id: req.session.teacherId });
      senderName = teacher ? teacher.name : 'Teacher';
      senderId = req.session.teacherId;
    } else if (req.session.role === 'admin') {
      senderName = 'Admin';
      senderId = 'admin';
    }

    const msg = await GroupMessage.create({
      senderId, senderRole: req.session.role, senderName, message: message.trim()
    });
    res.status(201).json({ ok: true, message: msg });
  } catch (err) {
    console.error('Group chat send error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ---------- PRIVATE CHAT (one thread per student, any teacher can reply) ----------

app.get('/student/messages', requireStudent, async (req, res) => {
  try {
    const student = await Student.findOne({ id: req.session.studentId });
    const messages = await PrivateMessage.find({ studentId: req.session.studentId }).sort({ createdAt: 1 });
    res.render('student/messages', { student, messages, page: 'messages' });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.post('/student/messages/send', requireStudent, async (req, res) => {
  try {
    const { message } = req.body;
    if (message && message.trim()) {
      const student = await Student.findOne({ id: req.session.studentId });
      await PrivateMessage.create({
        studentId: req.session.studentId,
        senderRole: 'student',
        senderId: req.session.studentId,
        senderName: student ? student.name : 'Student',
        message: message.trim()
      });
    }
    res.redirect('/student/messages');
  } catch (err) {
    console.error('Student message send error:', err);
    res.status(500).send("Database error");
  }
});

app.get('/teacher/messages', requireTeacher, async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ id: req.session.teacherId });
    const students = await Student.find({});

    const threads = await Promise.all(students.map(async (s) => {
      const lastMessage = await PrivateMessage.findOne({ studentId: s.id }).sort({ createdAt: -1 });
      return { student: s, lastMessage };
    }));

    threads.sort((a, b) => {
      const at = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const bt = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return bt - at;
    });

    res.render('teacher/messages', { teacher, threads, page: 'messages' });
  } catch (err) {
    console.error('Teacher messages list error:', err);
    res.status(500).send("Database error");
  }
});

app.get('/teacher/messages/:studentId', requireTeacher, async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ id: req.session.teacherId });
    const student = await Student.findOne({ id: req.params.studentId });
    if (!student) return res.redirect('/teacher/messages');

    const messages = await PrivateMessage.find({ studentId: req.params.studentId }).sort({ createdAt: 1 });
    res.render('teacher/message-thread', { teacher, student, messages, page: 'messages' });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.post('/teacher/messages/:studentId/send', requireTeacher, async (req, res) => {
  try {
    const { message } = req.body;
    if (message && message.trim()) {
      const teacher = await Teacher.findOne({ id: req.session.teacherId });
      await PrivateMessage.create({
        studentId: req.params.studentId,
        senderRole: 'teacher',
        senderId: req.session.teacherId,
        senderName: teacher ? teacher.name : 'Teacher',
        message: message.trim()
      });

      await sendPushToStudent(
        req.params.studentId,
        'New Message',
        `${teacher ? teacher.name : 'A teacher'} sent you a message.`,
        '/student/messages'
      );
    }
    res.redirect(`/teacher/messages/${req.params.studentId}`);
  } catch (err) {
    console.error('Teacher message send error:', err);
    res.status(500).send("Database error");
  }
});

// ---------- ADMIN ----------
app.get('/admin', requireAdmin, async (req, res) => {
  try {
    const db = await buildAdminDb();
    res.render('admin/dashboard', { db, page: 'dashboard' });
  } catch (err) {
    console.error("Error loading admin dashboard:", err);
    res.status(500).send("Database error");
  }
});

app.get('/admin/students', requireAdmin, async (req, res) => {
  try {
    const db = await buildAdminDb();
    res.render('admin/students', { db, page: 'students', error: null, newId: req.query.newId || null });
  } catch (err) {
    console.error("Error fetching students:", err);
    res.status(500).send("Database error");
  }
});

app.post('/admin/students/add', requireAdmin, upload.single('photo'), async (req, res) => {
  try {
    const { year, name, class: cls, roll, password, guardianName, guardianPin, phone, section } = req.body;
    const id = generateStudentId(year, cls, roll);

    const existingStudent = await Student.findOne({ id: id });
    if (existingStudent) {
      const db = await buildAdminDb();
      return res.render('admin/students', { db, page: 'students', error: `A student with ID ${id} already exists.`, newId: null });
    }

    const photoUrl = req.file ? `/uploads/${req.file.filename}` : '';
    await Student.create({
      id, name, class: cls, section: section || '', roll, password,
      guardianName, guardianPin, phone, photoUrl
    });

    res.redirect(`/admin/students?newId=${encodeURIComponent(id)}`);
  } catch (err) {
    console.error("Error adding student:", err);
    res.status(500).send("Database error");
  }
});

app.get('/admin/students/edit/:id', requireAdmin, async (req, res) => {
  try {
    const student = await Student.findOne({ id: req.params.id });
    if (!student) return res.redirect('/admin/students');
    const db = await buildAdminDb();
    res.render('admin/student-edit', { db, page: 'students', student });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.post('/admin/students/edit/:id', requireAdmin, upload.single('photo'), async (req, res) => {
  try {
    const { name, class: cls, section, roll, guardianName, guardianPin, phone, newPassword } = req.body;
    const updateData = { name, class: cls, section, roll, guardianName, guardianPin, phone };
    if (req.file) updateData.photoUrl = `/uploads/${req.file.filename}`;
    if (newPassword && newPassword.trim()) updateData.password = newPassword.trim();

    await Student.updateOne({ id: req.params.id }, { $set: updateData });
    res.redirect('/admin/students');
  } catch (err) {
    console.error("Error updating student:", err);
    res.status(500).send("Database error");
  }
});

app.post('/admin/students/delete/:id', requireAdmin, async (req, res) => {
  try {
    await Student.deleteOne({ id: req.params.id });
    res.redirect('/admin/students');
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.get('/admin/teachers', requireAdmin, async (req, res) => {
  try {
    const db = await buildAdminDb();
    res.render('admin/teachers', { db, page: 'teachers' });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.post('/admin/teachers/add', requireAdmin, upload.single('photo'), async (req, res) => {
  try {
    const { id, name, password, subjects, phone } = req.body;
    const photoUrl = req.file ? `/uploads/${req.file.filename}` : '';
    const subjectList = subjects.split(',').map(s => s.trim()).filter(Boolean);
    await Teacher.create({ id, name, password, subjects: subjectList, phone, photoUrl });
    res.redirect('/admin/teachers');
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.get('/admin/teachers/edit/:id', requireAdmin, async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ id: req.params.id });
    if (!teacher) return res.redirect('/admin/teachers');
    res.render('admin/teacher-edit', { teacher, page: 'teachers' });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.post('/admin/teachers/edit/:id', requireAdmin, upload.single('photo'), async (req, res) => {
  try {
    const { name, subjects, phone, newPassword } = req.body;
    const updateData = { name, subjects: subjects.split(',').map(s => s.trim()).filter(Boolean), phone };
    if (req.file) updateData.photoUrl = `/uploads/${req.file.filename}`;
    if (newPassword && newPassword.trim()) updateData.password = newPassword.trim();

    await Teacher.updateOne({ id: req.params.id }, { $set: updateData });
    res.redirect('/admin/teachers');
  } catch (err) {
    console.error("Error updating teacher:", err);
    res.status(500).send("Database error");
  }
});

app.post('/admin/teachers/delete/:id', requireAdmin, async (req, res) => {
  try {
    await Teacher.deleteOne({ id: req.params.id });
    res.redirect('/admin/teachers');
  } catch (err) {
    console.error("Error deleting teacher:", err);
    res.status(500).send("Database error");
  }
});

app.get('/admin/attendance', requireAdmin, async (req, res) => {
  try {
    const selectedClass = req.query.class || 'Six';
    const selectedSection = req.query.section || '';
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const availableSections = CLASS_SECTIONS[selectedClass] || [];

    const studentFilter = { class: selectedClass };
    if (selectedSection) studentFilter.section = selectedSection;
    const students = await Student.find(studentFilter);

    const attendanceRecords = await Attendance.find({ date });
    const existing = {};
    attendanceRecords.forEach(a => { existing[a.studentId] = { status: a.status, id: a._id }; });

    const db = await buildAdminDb();
    res.render('admin/attendance', {
      db, students, date, existing, selectedClass, selectedSection, availableSections, page: 'attendance'
    });
  } catch (err) {
    console.error("Error loading attendance:", err);
    res.status(500).send("Database error");
  }
});

app.post('/admin/attendance/save', requireAdmin, async (req, res) => {
  try {
    const { date, studentIds, statuses, class: cls, section } = req.body;

    if (!studentIds) {
      return res.redirect(`/admin/attendance?class=${encodeURIComponent(cls)}&section=${encodeURIComponent(section || '')}&date=${date}`);
    }

    const ids = Array.isArray(studentIds) ? studentIds : [studentIds];
    const sts = Array.isArray(statuses) ? statuses : [statuses];

    const existing = await Attendance.find({ date, studentId: { $in: ids } });
    const existingIds = new Set(existing.map(a => a.studentId));

    const newRecords = ids
      .map((id, i) => ({ studentId: id, date, status: sts[i] }))
      .filter(r => !existingIds.has(r.studentId));

    if (newRecords.length > 0) {
      await Attendance.insertMany(newRecords);
      // Notify each student that was just marked
      await Promise.all(newRecords.map(r =>
        sendPushToStudent(
          r.studentId,
          'Attendance Marked',
          `You were marked ${r.status} for ${r.date}.`,
          '/student/attendance'
        )
      ));
    }

    res.redirect(`/admin/attendance?class=${encodeURIComponent(cls)}&section=${encodeURIComponent(section || '')}&date=${date}`);
  } catch (err) {
    console.error("Error saving attendance:", err);
    res.status(500).send("Database error during attendance save");
  }
});

app.post('/admin/attendance/edit/:id', requireAdmin, async (req, res) => {
  try {
    const { status, date, class: cls, section } = req.body;
    const updated = await Attendance.findByIdAndUpdate(req.params.id, { status }, { new: true });

    if (updated) {
      await sendPushToStudent(
        updated.studentId,
        'Attendance Updated',
        `Your attendance for ${updated.date} was updated to ${updated.status}.`,
        '/student/attendance'
      );
    }

    res.redirect(`/admin/attendance?class=${encodeURIComponent(cls)}&section=${encodeURIComponent(section || '')}&date=${date}`);
  } catch (err) {
    console.error("Error editing attendance:", err);
    res.status(500).send("Database error during attendance edit");
  }
});

app.get('/admin/routine', requireAdmin, async (req, res) => {
  try {
    const db = await buildAdminDb();
    res.render('admin/routine', { db, page: 'routine' });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.post('/admin/routine/add', requireAdmin, async (req, res) => {
  try {
    const { class: cls, section, day, period, time, subject, teacherId } = req.body;
    const teacher = await Teacher.findOne({ id: teacherId });
    await Routine.create({
      class: cls, section, day, period, time, subject, teacherId,
      teacherName: teacher ? teacher.name : ''
    });
    res.redirect('/admin/routine');
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.get('/admin/routine/edit/:id', requireAdmin, async (req, res) => {
  try {
    const entry = await Routine.findById(req.params.id);
    if (!entry) return res.redirect('/admin/routine');
    const db = await buildAdminDb();
    res.render('admin/routine-edit', { db, entry, page: 'routine' });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.post('/admin/routine/edit/:id', requireAdmin, async (req, res) => {
  try {
    const { class: cls, section, day, period, time, subject, teacherId } = req.body;
    const teacher = await Teacher.findOne({ id: teacherId });
    await Routine.findByIdAndUpdate(req.params.id, {
      class: cls, section, day, period, time, subject, teacherId,
      teacherName: teacher ? teacher.name : ''
    });
    res.redirect('/admin/routine');
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.post('/admin/routine/delete/:id', requireAdmin, async (req, res) => {
  try {
    await Routine.findByIdAndDelete(req.params.id);
    res.redirect('/admin/routine');
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.get('/admin/exams', requireAdmin, async (req, res) => {
  try {
    const db = await buildAdminDb();
    res.render('admin/exams', { db, page: 'exams' });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.post('/admin/exams/add', requireAdmin, async (req, res) => {
  try {
    await Exam.create(req.body);
    res.redirect('/admin/exams');
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.get('/admin/exams/edit/:id', requireAdmin, async (req, res) => {
  try {
    const entry = await Exam.findById(req.params.id);
    if (!entry) return res.redirect('/admin/exams');
    const db = await buildAdminDb();
    res.render('admin/exam-edit', { db, entry, page: 'exams' });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.post('/admin/exams/edit/:id', requireAdmin, async (req, res) => {
  try {
    const { class: cls, section, examName, subject, date, time } = req.body;
    await Exam.findByIdAndUpdate(req.params.id, { class: cls, section, examName, subject, date, time });
    res.redirect('/admin/exams');
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.post('/admin/exams/delete/:id', requireAdmin, async (req, res) => {
  try {
    await Exam.findByIdAndDelete(req.params.id);
    res.redirect('/admin/exams');
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.get('/admin/results', requireAdmin, async (req, res) => {
  try {
    const db = await buildAdminDb();
    res.render('admin/results', { db, page: 'results' });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.post('/admin/results/add', requireAdmin, async (req, res) => {
  try {
    const { studentId, examName, subject, fullMarks, obtained, publishDate } = req.body;
    await Result.deleteOne({ studentId, examName, subject });
    await Result.create({
      studentId, examName, subject,
      fullMarks: Number(fullMarks), obtained: Number(obtained), publishDate: publishDate || ''
    });
    res.redirect('/admin/results');
  } catch (err) {
    console.error("Error adding result:", err);
    res.status(500).send("Database error");
  }
});

app.get('/admin/results/edit/:id', requireAdmin, async (req, res) => {
  try {
    const entry = await Result.findById(req.params.id);
    if (!entry) return res.redirect('/admin/results');
    const db = await buildAdminDb();
    res.render('admin/result-edit', { db, entry, page: 'results' });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.post('/admin/results/edit/:id', requireAdmin, async (req, res) => {
  try {
    const { studentId, examName, subject, fullMarks, obtained, publishDate } = req.body;
    await Result.findByIdAndUpdate(req.params.id, {
      studentId, examName, subject,
      fullMarks: Number(fullMarks), obtained: Number(obtained), publishDate: publishDate || ''
    });
    res.redirect('/admin/results');
  } catch (err) {
    console.error("Error editing result:", err);
    res.status(500).send("Database error");
  }
});

app.post('/admin/results/delete/:id', requireAdmin, async (req, res) => {
  try {
    await Result.findByIdAndDelete(req.params.id);
    res.redirect('/admin/results');
  } catch (err) {
    console.error("Error deleting result:", err);
    res.status(500).send("Database error");
  }
});

app.get('/admin/fees', requireAdmin, async (req, res) => {
  try {
    const db = await buildAdminDb();
    res.render('admin/fees', { db, page: 'fees' });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.post('/admin/fees/add', requireAdmin, async (req, res) => {
  try {
    const { studentId, monthName, year, amount, status } = req.body;
    const month = `${monthName} ${year}`;
    await Fee.deleteOne({ studentId, month });
    await Fee.create({
      studentId, month, amount: Number(amount), status,
      paidDate: status === 'Paid' ? new Date().toISOString().slice(0, 10) : null
    });

    await sendPushToStudent(
      studentId,
      'Fee Update',
      `Your fee for ${month} has been marked ${status}.`,
      '/student/fees'
    );

    res.redirect('/admin/fees');
  } catch (err) {
    console.error("Error adding fee:", err);
    res.status(500).send("Database error");
  }
});

app.get('/admin/fees/edit/:id', requireAdmin, async (req, res) => {
  try {
    const entry = await Fee.findById(req.params.id);
    if (!entry) return res.redirect('/admin/fees');
    const [entryMonthName, entryYear] = entry.month ? entry.month.split(' ') : ['', ''];
    const db = await buildAdminDb();
    res.render('admin/fee-edit', { db, entry, page: 'fees', entryMonthName, entryYear });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.post('/admin/fees/edit/:id', requireAdmin, async (req, res) => {
  try {
    const { studentId, monthName, year, amount, status } = req.body;
    const month = `${monthName} ${year}`;
    await Fee.findByIdAndUpdate(req.params.id, {
      studentId, month, amount: Number(amount), status,
      paidDate: status === 'Paid' ? new Date().toISOString().slice(0, 10) : null
    });

    await sendPushToStudent(
      studentId,
      'Fee Update',
      `Your fee for ${month} has been updated to ${status}.`,
      '/student/fees'
    );

    res.redirect('/admin/fees');
  } catch (err) {
    console.error("Error editing fee:", err);
    res.status(500).send("Database error");
  }
});

app.post('/admin/fees/delete/:id', requireAdmin, async (req, res) => {
  try {
    await Fee.findByIdAndDelete(req.params.id);
    res.redirect('/admin/fees');
  } catch (err) {
    console.error("Error deleting fee:", err);
    res.status(500).send("Database error");
  }
});

app.post('/admin/fees/toggle/:studentId/:month', requireAdmin, async (req, res) => {
  try {
    const { studentId, month } = req.params;
    const fee = await Fee.findOne({ studentId, month });
    if (fee) {
      const newStatus = fee.status === 'Paid' ? 'Due' : 'Paid';
      fee.status = newStatus;
      fee.paidDate = newStatus === 'Paid' ? new Date().toISOString().slice(0, 10) : null;
      await fee.save();

      await sendPushToStudent(
        studentId,
        'Fee Update',
        `Your fee for ${month} is now marked ${fee.status}.`,
        '/student/fees'
      );
    }
    res.redirect('/admin/fees');
  } catch (err) {
    console.error("Error toggling fee status:", err);
    res.status(500).send("Database error");
  }
});

app.get('/admin/profile', requireAdmin, async (req, res) => {
  try {
    const db = await buildAdminDb();
    res.render('admin/profile', { db, page: 'profile', message: null, error: null });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.post('/admin/profile/change-password', requireAdmin, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    let admin = await Admin.findOne({});

    if (!admin) {
      admin = await Admin.create({ username: process.env.ADMIN_USER || 'admin', password: process.env.ADMIN_PASSWORD || '' });
    }

    if (admin.password !== currentPassword) {
      const db = await buildAdminDb();
      return res.render('admin/profile', { db, page: 'profile', message: null, error: 'Current password is incorrect' });
    }

    admin.password = newPassword;
    await admin.save();

    const db = await buildAdminDb();
    res.render('admin/profile', { db, page: 'profile', message: 'Password updated successfully', error: null });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.post('/admin/reset', requireAdmin, async (req, res) => {
  try {
    await Promise.all([
      Student.deleteMany({}),
      Attendance.deleteMany({}),
      Routine.deleteMany({}),
      Exam.deleteMany({}),
      Result.deleteMany({}),
      Fee.deleteMany({})
    ]);
    res.redirect('/admin');
  } catch (err) {
    res.status(500).send("Database reset failed");
  }
});

// ---------- TEACHER ----------

app.get('/teacher', requireTeacher, async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ id: req.session.teacherId });
    const schedule = await Routine.find({ teacherId: req.session.teacherId });
    res.render('teacher/dashboard', { teacher, schedule, page: 'dashboard' });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.get('/teacher/schedule', requireTeacher, async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ id: req.session.teacherId });
    const schedule = await Routine.find({ teacherId: req.session.teacherId });
    res.render('teacher/schedule', { teacher, schedule, page: 'schedule' });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.get('/teacher/profile', requireTeacher, async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ id: req.session.teacherId });
    res.render('teacher/profile', { teacher, page: 'profile', message: null, error: null });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.post('/teacher/profile/change-password', requireTeacher, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const teacher = await Teacher.findOne({ id: req.session.teacherId });

    if (teacher.password !== currentPassword) {
      return res.render('teacher/profile', {
        teacher, page: 'profile', message: null, error: 'Current password is incorrect'
      });
    }

    teacher.password = newPassword;
    await teacher.save();

    res.render('teacher/profile', {
      teacher, page: 'profile', message: 'Password updated successfully', error: null
    });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

// ---------- STUDENT ----------
app.get('/student', requireStudent, async (req, res) => {
  try {
    const data = await buildStudentData(req.session.studentId);
    if (!data) return res.redirect('/');
    res.render('student/dashboard', { ...data, page: 'dashboard' });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.get('/student/attendance', requireStudent, async (req, res) => {
  try {
    const data = await buildStudentData(req.session.studentId);
    if (!data) return res.redirect('/');
    res.render('student/attendance', { ...data, page: 'attendance' });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.get('/student/routine', requireStudent, async (req, res) => {
  try {
    const data = await buildStudentData(req.session.studentId);
    if (!data) return res.redirect('/');
    res.render('student/routine', { ...data, page: 'routine' });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.get('/student/exams', requireStudent, async (req, res) => {
  try {
    const data = await buildStudentData(req.session.studentId);
    if (!data) return res.redirect('/');
    res.render('student/exams', { ...data, page: 'exams' });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.get('/student/results', requireStudent, async (req, res) => {
  try {
    const data = await buildStudentData(req.session.studentId);
    if (!data) return res.redirect('/');
    res.render('student/results', { ...data, page: 'results' });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.get('/student/fees', requireStudent, async (req, res) => {
  try {
    const data = await buildStudentData(req.session.studentId);
    if (!data) return res.redirect('/');
    res.render('student/fees', { ...data, page: 'fees' });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.get('/student/profile', requireStudent, async (req, res) => {
  try {
    const student = await Student.findOne({ id: req.session.studentId });
    res.render('student/profile', { student, page: 'profile', message: null, error: null });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.post('/student/profile/change-password', requireStudent, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const student = await Student.findOne({ id: req.session.studentId });

    if (student.password !== currentPassword) {
      return res.render('student/profile', { student, page: 'profile', message: null, error: 'Current password is incorrect' });
    }

    student.password = newPassword;
    await student.save();
    res.render('student/profile', { student, page: 'profile', message: 'Password updated successfully', error: null });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.post('/student/profile/photo', requireStudent, upload.single('photo'), async (req, res) => {
  try {
    if (req.file) {
      await Student.updateOne({ id: req.session.studentId }, { photoUrl: `/uploads/${req.file.filename}` });
    }
    res.redirect('/student/profile');
  } catch (err) {
    res.status(500).send("Database error");
  }
});

// ---------- GUARDIAN (read-only, same views as student but different layout/route) ----------
app.get('/guardian', requireGuardian, async (req, res) => {
  try {
    const data = await buildStudentData(req.session.studentId);
    if (!data) return res.redirect('/');
    res.render('guardian/dashboard', { ...data, page: 'dashboard' });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.get('/guardian/attendance', requireGuardian, async (req, res) => {
  try {
    const data = await buildStudentData(req.session.studentId);
    if (!data) return res.redirect('/');
    res.render('guardian/attendance', { ...data, page: 'attendance' });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.get('/guardian/routine', requireGuardian, async (req, res) => {
  try {
    const data = await buildStudentData(req.session.studentId);
    if (!data) return res.redirect('/');
    res.render('guardian/routine', { ...data, page: 'routine' });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.get('/guardian/exams', requireGuardian, async (req, res) => {
  try {
    const data = await buildStudentData(req.session.studentId);
    if (!data) return res.redirect('/');
    res.render('guardian/exams', { ...data, page: 'exams' });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.get('/guardian/fees', requireGuardian, async (req, res) => {
  try {
    const data = await buildStudentData(req.session.studentId);
    if (!data) return res.redirect('/');
    res.render('guardian/fees', { ...data, page: 'fees' });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.get('/guardian/profile', requireGuardian, async (req, res) => {
  try {
    const student = await Student.findOne({ id: req.session.studentId });
    res.render('guardian/profile', { student, page: 'profile', message: null, error: null });
  } catch (err) {
    res.status(500).send("Database error");
  }
});

app.post('/guardian/profile/change-pin', requireGuardian, async (req, res) => {
  try {
    const { currentPin, newPin } = req.body;
    const student = await Student.findOne({ id: req.session.studentId });

    if (student.guardianPin !== currentPin) {
      return res.render('guardian/profile', {
        student, page: 'profile', message: null, error: 'Current PIN is incorrect'
      });
    }

    student.guardianPin = newPin;
    await student.save();

    res.render('guardian/profile', {
      student, page: 'profile', message: 'PIN updated successfully', error: null
    });
  } catch (err) {
    res.status(500).send("Database error");
  }
});
