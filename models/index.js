const mongoose = require('mongoose');

const pushSubscriptionSchema = new mongoose.Schema({
  studentId: String,
  subscription: Object,
  createdAt: { type: Date, default: Date.now }
});

// One global chat room — everyone (students, teachers, admin) posts and reads here
const groupMessageSchema = new mongoose.Schema({
  senderId: String,
  senderRole: String,   // 'student' | 'teacher' | 'admin'
  senderName: String,
  message: String,
  createdAt: { type: Date, default: Date.now }
});

// One private thread per student. Any teacher can see/reply to any student's thread.
// Other students never see this — only their own thread.
const privateMessageSchema = new mongoose.Schema({
  studentId: String,    // whose thread this belongs to
  senderRole: String,   // 'student' | 'teacher'
  senderId: String,     // studentId if student sent it, teacherId if teacher sent it
  senderName: String,
  message: String,
  createdAt: { type: Date, default: Date.now }
});

// Student Schema
const studentSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: String,
  class: String,
  section: String,
  roll: Number,
  password: { type: String, required: true },
  guardianName: String,
  guardianPin: String,
  phone: String,
  photoUrl: String
});

// Teacher Schema
const teacherSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: String,
  password: { type: String, required: true },
  subjects: [String],
  phone: String,
  photoUrl: String
});

// Attendance Schema
const attendanceSchema = new mongoose.Schema({
  studentId: String,
  date: String,
  status: String
});

// Routine Schema
const routineSchema = new mongoose.Schema({
  class: String,
  section: String,
  day: String,
  period: String,
  time: String,
  subject: String,
  teacherId: String,
  teacherName: String
});

const guardianSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  studentIds: [String]
});

// Fee Schema
const feeSchema = new mongoose.Schema({
  studentId: String,
  month: String,
  amount: Number,
  paidAmount: { type: Number, default: 0 },
  status: { type: String, default: 'Due' },
  paidDate: String
});

// Exam Schema
const examSchema = new mongoose.Schema({
  class: String,
  section: String,
  examName: String,
  subject: String,
  date: String,
  time: String
});

// Result Schema
const resultSchema = new mongoose.Schema({
  studentId: String,
  examName: String,
  subject: String,
  fullMarks: Number,
  obtained: Number,
  publishDate: String
});

// Admin Schema
const adminSchema = new mongoose.Schema({
  username: String,
  password: String
});

module.exports = {
  PushSubscription: mongoose.model('PushSubscription', pushSubscriptionSchema),
  GroupMessage: mongoose.model('GroupMessage', groupMessageSchema),
  PrivateMessage: mongoose.model('PrivateMessage', privateMessageSchema),
  Student: mongoose.model('Student', studentSchema),
  Teacher: mongoose.model('Teacher', teacherSchema),
  Attendance: mongoose.model('Attendance', attendanceSchema),
  Routine: mongoose.model('Routine', routineSchema),
  Guardian: mongoose.model('Guardian', guardianSchema),
  Fee: mongoose.model('Fee', feeSchema),
  Exam: mongoose.model('Exam', examSchema),
  Result: mongoose.model('Result', resultSchema),
  Admin: mongoose.model('Admin', adminSchema)
};
