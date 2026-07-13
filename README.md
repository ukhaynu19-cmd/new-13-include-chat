# Hill Academic Care (School ERP)

A web app with four portals sharing one live database:

- **Admin** — full control: manage students, manage teachers, mark daily attendance, set class routines (linked to a real teacher), set exam routines, enter/edit/delete results, manage/edit/delete fees, change own password, and clear all sample data.
- **Teacher** — logs in with a Teacher ID + password, sees their assigned subjects and weekly class schedule, and can change their own password.
- **Student** — logs in with Student ID + password, sees their own attendance %, routine, exam schedule, results, and fee status, can change their own password and upload their own photo.
- **Guardian** — logs in with the child's Student ID + a Guardian PIN (no separate account setup needed), read-only view of the same live data, and can change their own PIN.

Every change an admin makes appears instantly for the student, teacher, and guardian — they all read from the same data file. Nearly everything the admin enters — attendance, class routine, exam routine, results, fees, teacher records, student records — can be edited or deleted afterward, not just added.

## Running it locally

1. Install [Node.js](https://nodejs.org) (v18+) if you don't have it.
2. Open a terminal in this folder and run:
   ```
   npm install
   npm start
   ```
3. Open **http://localhost:3000** in your browser.

## Demo logins (seeded sample data)

| Role     | ID / Username | Password / PIN |
|----------|---------------|-----------------|
| Admin    | admin         | admin123        |
| Teacher  | T001          | teacher123      |
| Student  | 10045         | student123      |
| Guardian | 10045         | 1111            |

## How the data works

All data lives in `data/db.json` — students, attendance, class routines, exam routines, results, and fees. The admin panel edits this file through the web forms; you never need to touch it by hand. This is a simple, transparent format that's easy to back up (just copy the file) and easy to later migrate into a real database (MySQL/PostgreSQL) if the school grows.

## Putting this online so guardians can access it from home

Right now this only runs on your own computer. To make it reachable by parents over the internet, you need to host it somewhere. Good low-cost options:

- **Render.com** or **Railway.app** — free/cheap tiers, just connect this project's code and it deploys automatically.
- A shared hosting/VPS provider that supports Node.js (many Bangladeshi hosts offer this).

Once hosted, change the admin password immediately (`data/db.json` → `admin.password`), and change or remove the demo student/guardian PINs before giving guardians real access.

## Structure

```
server.js          → all routes and logic
db.js               → reads/writes data/db.json
data/db.json        → the database (students, attendance, routines, exams, results, fees)
views/              → all pages (login, admin/*, student/*, guardian/*)
public/css/         → styling
```

## Extending it

- Add more classes/sections: edit the `classes` and `sections` arrays in `data/db.json`.
- Add subjects, teachers, or a "Teachers & Staff" login: follow the same pattern used for students.
- Want SMS/email alerts when a student is marked absent, or online fee payment (bKash/Nagad)? Those can be added next — just ask.
