# Movement By Design — Staff Login Credentials

> **Default Password for ALL accounts:** `mbd2026`
>
> ⚠️ **Change passwords after first login in production!**

---

## 🔑 Login Credentials by Role

### 👑 OWNER
| Name | Email | Password | Designation |
|------|-------|----------|-------------|
| Marazban Doctor | `marazban@mbd.in` | `mbd2026` | Founder |

### 🛠️ ADMIN
| Name | Email | Password | Designation |
|------|-------|----------|-------------|
| Dr. Yasir Zahid | `yasir@mbd.in` | `mbd2026` | Head Physiotherapist |

### 🩺 CONSULTANT
| Name | Email | Password | Designation |
|------|-------|----------|-------------|
| Dr. Prerna Chhugani | `prerna@mbd.in` | `mbd2026` | Medical Consultant |

### 🖥️ FRONT OFFICE
| Name | Email | Password | Designation |
|------|-------|----------|-------------|
| Ramchandra Bharankar | `ramchandra@mbd.in` | `mbd2026` | Front Office Executive |
| Lata Sonawane | `lata@mbd.in` | `mbd2026` | Front Office Executive |
| Helen Fernandes | `helen@mbd.in` | `mbd2026` | Front Office Executive |

### 💪 THERAPISTS
| Name | Email | Password | Designation | Department |
|------|-------|----------|-------------|------------|
| Danesh Doctor | `danesh@mbd.in` | `mbd2026` | S&C Coach | Strength & Conditioning |
| Dr. Devanshi Vira | `devanshi@mbd.in` | `mbd2026` | Senior Physiotherapist | Physiotherapy |
| Dr. Aanchal Sharma | `aanchal@mbd.in` | `mbd2026` | Senior Physiotherapist | Physiotherapy |
| Dr. Tasneem Ansari | `tasneem@mbd.in` | `mbd2026` | Senior Physiotherapist | Physiotherapy |
| Dr. Deepa Mourya | `deepa@mbd.in` | `mbd2026` | Senior Physiotherapist | Physiotherapy |
| Dr. Sanya Jain | `sanya@mbd.in` | `mbd2026` | Senior Physiotherapist | Physiotherapy |
| Sanjay More | `sanjay@mbd.in` | `mbd2026` | Massage Therapist | Massage |
| Dipali Sawant | `dipali@mbd.in` | `mbd2026` | Massage Therapist | Massage |
| Harshali Karkare | `harshali@mbd.in` | `mbd2026` | Massage Therapist | Massage |
| Naina Daryanani | `naina@mbd.in` | `mbd2026` | Yoga Specialist | Yoga |
| Shivli Malani | `shivli@mbd.in` | `mbd2026` | Yoga & Sound Healer | Yoga |
| Disha Chandan | `disha@mbd.in` | `mbd2026` | Integrated Counsellor | Counselling |
| Shruti Vibhakar | `shruti@mbd.in` | `mbd2026` | Emotional Healing Counsellor | Counselling |
| Sheetal Somaiya | `sheetal@mbd.in` | `mbd2026` | Senior Nutritionist | Nutrition |
| Rajal Shah | `rajal@mbd.in` | `mbd2026` | Associate Nutritionist | Nutrition |

---

## 🔐 Role Access Matrix

| Feature | OWNER | ADMIN | CONSULTANT | THERAPIST | FRONT_OFFICE | MANAGER |
|---------|:-----:|:-----:|:----------:|:---------:|:------------:|:-------:|
| **Dashboard** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **View Patients** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Edit Patient Demographics** | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Edit Patient Clinical Data** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Patient Intake** | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Assign Therapist** | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **View Appointments** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Edit Appointments** | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| **Request Appointment Change** | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| **View Sessions** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Create Sessions** | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| **Edit Own Sessions** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **View Consultations** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Edit Own Consultations** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **View Clinical Notes** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Edit Own Clinical Notes** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Clinical Record PDF** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **View Invoices** | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| **Edit Invoices** | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **View Payments** | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| **Edit Payments** | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **View Packages** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Edit Packages** | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **View Reports** | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **MIS Dashboard** | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **Export Data** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Staff Management** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Service Management** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Settings** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Audit Trail** | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **Client Flags** | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| **Inventory** | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| **Attendance** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Notifications** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Manage Notifications** | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| **Create Change Requests** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Review Change Requests** | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |

---

## 📋 Role Descriptions

| Role | Description | Typical User |
|------|-------------|--------------|
| **OWNER** | Full system access. Can manage staff, view MIS reports, export data, and configure all settings. | Marazban (Founder) |
| **ADMIN** | Clinical + administrative access. Can manage staff, services, audit trail, and approve change requests. | Dr. Yasir (Head PT) |
| **CONSULTANT** | Clinical access only. Can view patients, write consultations and clinical notes, request schedule changes. | Dr. Prerna |
| **THERAPIST** | Same as Consultant. Can view their patients, log sessions, write notes, and request changes. | All therapists |
| **FRONT_OFFICE** | Operational access. Handles intake, scheduling, billing, payments, packages, and processes change requests. | Ramchandra, Lata, Helen |
| **MANAGER** | Read-only management view. Can see reports, MIS, audit trail, and patient data but cannot edit. | (Not currently assigned) |

---

## 🔗 Quick Test Logins

For testing different role views, use these accounts:

| What to Test | Login As | Email |
|---|---|---|
| Full admin experience | Owner | `marazban@mbd.in` |
| Clinical workflow (doctor) | Admin | `yasir@mbd.in` |
| Therapist view | Therapist | `devanshi@mbd.in` |
| Front office operations | Front Office | `ramchandra@mbd.in` |
| Consultant view | Consultant | `prerna@mbd.in` |
