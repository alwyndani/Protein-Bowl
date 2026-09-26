import React, { useState } from 'react';
import { StaffEmployee, AttendanceRecord, LeaveApplication, PayslipRecord, SeparationRecord, AppointmentLetter, UserRole } from '../../types';
import { 
  Users, 
  DollarSign, 
  Calendar, 
  FileText, 
  Plus, 
  Check, 
  X, 
  Search, 
  Printer, 
  Building2, 
  Briefcase, 
  CreditCard, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  UserCheck, 
  Sparkles, 
  Download,
  Filter,
  ShieldCheck,
  Receipt,
  UserX,
  AlertTriangle,
  FileCheck,
  CheckSquare,
  Square,
  Award,
  Scale,
  ShieldAlert,
  Send,
  Copy,
  Key,
  Utensils,
  ChefHat,
  Truck,
  Layers,
  ArrowRight
} from 'lucide-react';
import confetti from 'canvas-confetti';

export interface HRMModuleProps {
  onSwitchRole?: (role: UserRole) => void;
  onLoginAsStaff?: (staff: StaffEmployee) => void;
}

export const INITIAL_STAFF: StaffEmployee[] = [
  {
    id: 'EMP-101',
    name: 'Dr. Priya Nair',
    role: 'Senior Clinical Dietitian',
    department: 'Clinical Nutrition',
    email: 'priya@proteinbowl.in',
    phone: '+91 98470 11223',
    dateOfJoining: '2024-03-15',
    status: 'Active',
    bankDetails: {
      bankName: 'HDFC Bank, MG Road Kochi',
      accountNumber: '50100234891122',
      ifscCode: 'HDFC0001234',
      panNumber: 'ABCDE1234F',
      upiId: 'priya@hdfcbank'
    },
    payrollSetup: {
      baseSalary: 45000,
      travelAllowance: 3000,
      medicalAllowance: 2000,
      phoneAllowance: 1000,
      specialBonus: 2000,
      pfDeduction: 3600,
      esiDeduction: 350,
      ptDeduction: 200,
      tdsDeduction: 1500
    },
    leaveBalance: {
      casualLeaveRemaining: 8,
      sickLeaveRemaining: 6,
      earnedLeaveRemaining: 12
    }
  },
  {
    id: 'EMP-102',
    name: 'Chef Suresh Kumar',
    role: 'Head Kitchen Executive Chef',
    department: 'Kitchen & Culinary',
    email: 'suresh@proteinbowl.in',
    phone: '+91 97450 33445',
    dateOfJoining: '2024-01-10',
    status: 'Active',
    bankDetails: {
      bankName: 'State Bank of India, Kakkanad',
      accountNumber: '389201928371',
      ifscCode: 'SBIN0008765',
      panNumber: 'FGHIJ5678K',
      upiId: 'suresh@sbi'
    },
    payrollSetup: {
      baseSalary: 50000,
      travelAllowance: 4000,
      medicalAllowance: 2500,
      phoneAllowance: 1000,
      specialBonus: 3000,
      pfDeduction: 4000,
      esiDeduction: 400,
      ptDeduction: 200,
      tdsDeduction: 2000
    },
    leaveBalance: {
      casualLeaveRemaining: 10,
      sickLeaveRemaining: 5,
      earnedLeaveRemaining: 14
    }
  },
  {
    id: 'EMP-103',
    name: 'Rajesh V. Pillai',
    role: 'Procurement & Inventory Lead',
    department: 'Procurement & Inventory',
    email: 'rajesh@proteinbowl.in',
    phone: '+91 96330 55667',
    dateOfJoining: '2024-06-01',
    status: 'Active',
    bankDetails: {
      bankName: 'ICICI Bank, Edappally',
      accountNumber: '001205018293',
      ifscCode: 'ICIC0000012',
      panNumber: 'KLMNO9012P',
      upiId: 'rajesh@icici'
    },
    payrollSetup: {
      baseSalary: 32000,
      travelAllowance: 2500,
      medicalAllowance: 1500,
      phoneAllowance: 800,
      specialBonus: 1000,
      pfDeduction: 2560,
      esiDeduction: 280,
      ptDeduction: 200,
      tdsDeduction: 500
    },
    leaveBalance: {
      casualLeaveRemaining: 9,
      sickLeaveRemaining: 7,
      earnedLeaveRemaining: 10
    }
  },
  {
    id: 'EMP-104',
    name: 'Kiran K. Das',
    role: 'Logistics & Delivery Operations Supervisor',
    department: 'Logistics & Delivery',
    email: 'kiran@proteinbowl.in',
    phone: '+91 95260 77889',
    dateOfJoining: '2024-08-15',
    status: 'Active',
    bankDetails: {
      bankName: 'Federal Bank, Vyttila',
      accountNumber: '102938475612',
      ifscCode: 'FDRL0001029',
      panNumber: 'PQRST3456U',
      upiId: 'kiran@federal'
    },
    payrollSetup: {
      baseSalary: 28000,
      travelAllowance: 5000,
      medicalAllowance: 1500,
      phoneAllowance: 1000,
      specialBonus: 1000,
      pfDeduction: 2240,
      esiDeduction: 250,
      ptDeduction: 200,
      tdsDeduction: 0
    },
    leaveBalance: {
      casualLeaveRemaining: 11,
      sickLeaveRemaining: 8,
      earnedLeaveRemaining: 15
    }
  },
  {
    id: 'EMP-105',
    name: 'Chef Murugan K.',
    role: 'Kerala Mess Lead Chef (Kettles & Traditional Kitchen)',
    department: 'Kerala Mess & Hostel Ops',
    email: 'murugan@proteinbowl.in',
    phone: '+91 94470 66778',
    dateOfJoining: '2024-04-12',
    status: 'Active',
    bankDetails: {
      bankName: 'Canara Bank, Ernakulam South',
      accountNumber: '409210293847',
      ifscCode: 'CNRB0002045',
      panNumber: 'UVWXY7890Z',
      upiId: 'murugan@canara'
    },
    payrollSetup: {
      baseSalary: 42000,
      travelAllowance: 3000,
      medicalAllowance: 2000,
      phoneAllowance: 1000,
      specialBonus: 2500,
      pfDeduction: 3360,
      esiDeduction: 350,
      ptDeduction: 200,
      tdsDeduction: 1200
    },
    leaveBalance: {
      casualLeaveRemaining: 9,
      sickLeaveRemaining: 6,
      earnedLeaveRemaining: 11
    }
  },
  {
    id: 'EMP-106',
    name: 'Ananthan V. Menon',
    role: 'Kerala Mess Logistics & Hostel Distribution Manager',
    department: 'Kerala Mess & Hostel Ops',
    email: 'ananthan.mess@proteinbowl.in',
    phone: '+91 98950 44332',
    dateOfJoining: '2024-05-01',
    status: 'Active',
    bankDetails: {
      bankName: 'South Indian Bank, Panampilly Nagar',
      accountNumber: '04820530001928',
      ifscCode: 'SIBL0000482',
      panNumber: 'GHIJK1234L',
      upiId: 'ananthan@sib'
    },
    payrollSetup: {
      baseSalary: 35000,
      travelAllowance: 4500,
      medicalAllowance: 1500,
      phoneAllowance: 1000,
      specialBonus: 1500,
      pfDeduction: 2800,
      esiDeduction: 300,
      ptDeduction: 200,
      tdsDeduction: 800
    },
    leaveBalance: {
      casualLeaveRemaining: 10,
      sickLeaveRemaining: 7,
      earnedLeaveRemaining: 12
    }
  },
  {
    id: 'EMP-107',
    name: 'Lekshmi Devi R.',
    role: 'Kerala Mess Nutritional Auditor & Recipe Coordinator',
    department: 'Kerala Mess & Hostel Ops',
    email: 'lekshmi@proteinbowl.in',
    phone: '+91 97440 88991',
    dateOfJoining: '2024-09-01',
    status: 'Active',
    bankDetails: {
      bankName: 'State Bank of India, Kalamassery',
      accountNumber: '203948571029',
      ifscCode: 'SBIN0004032',
      panNumber: 'ABCDE5678R',
      upiId: 'lekshmi@sbi'
    },
    payrollSetup: {
      baseSalary: 38000,
      travelAllowance: 2500,
      medicalAllowance: 2000,
      phoneAllowance: 800,
      specialBonus: 1500,
      pfDeduction: 3040,
      esiDeduction: 320,
      ptDeduction: 200,
      tdsDeduction: 1000
    },
    leaveBalance: {
      casualLeaveRemaining: 12,
      sickLeaveRemaining: 8,
      earnedLeaveRemaining: 14
    }
  }
];

export const INITIAL_ATTENDANCE: AttendanceRecord[] = [
  { id: 'att-1', employeeId: 'EMP-101', employeeName: 'Dr. Priya Nair', date: '2026-07-29', status: 'Present', checkInTime: '08:45 AM', checkOutTime: '05:30 PM' },
  { id: 'att-2', employeeId: 'EMP-102', employeeName: 'Chef Suresh Kumar', date: '2026-07-29', status: 'Present', checkInTime: '06:30 AM', checkOutTime: '03:30 PM' },
  { id: 'att-3', employeeId: 'EMP-103', employeeName: 'Rajesh V. Pillai', date: '2026-07-29', status: 'Present', checkInTime: '09:00 AM', checkOutTime: '06:00 PM' },
  { id: 'att-4', employeeId: 'EMP-104', employeeName: 'Kiran K. Das', date: '2026-07-29', status: 'On Leave', notes: 'Casual Leave Approved' },
  { id: 'att-5', employeeId: 'EMP-105', employeeName: 'Chef Murugan K.', date: '2026-07-29', status: 'Present', checkInTime: '05:45 AM', checkOutTime: '02:30 PM' },
  { id: 'att-6', employeeId: 'EMP-106', employeeName: 'Ananthan V. Menon', date: '2026-07-29', status: 'Present', checkInTime: '06:15 AM', checkOutTime: '03:00 PM' },
  { id: 'att-7', employeeId: 'EMP-107', employeeName: 'Lekshmi Devi R.', date: '2026-07-29', status: 'Present', checkInTime: '08:30 AM', checkOutTime: '05:00 PM' },
];

export const INITIAL_LEAVES: LeaveApplication[] = [
  {
    id: 'lv-101',
    employeeId: 'EMP-104',
    employeeName: 'Kiran K. Das',
    role: 'Logistics Supervisor',
    leaveType: 'Casual',
    startDate: '2026-07-29',
    endDate: '2026-07-29',
    totalDays: 1,
    reason: 'Family event in Kottayam',
    status: 'Approved',
    appliedOn: '2026-07-27',
    reviewedBy: 'Managing Director'
  },
  {
    id: 'lv-102',
    employeeId: 'EMP-103',
    employeeName: 'Rajesh V. Pillai',
    role: 'Procurement Lead',
    leaveType: 'Sick',
    startDate: '2026-08-02',
    endDate: '2026-08-03',
    totalDays: 2,
    reason: 'Viral fever rest prescribed by physician',
    status: 'Pending',
    appliedOn: '2026-07-28'
  }
];

export const INITIAL_SEPARATIONS: SeparationRecord[] = [
  {
    id: 'SEP-101',
    employeeId: 'EMP-104',
    employeeName: 'Kiran K. Das',
    role: 'Logistics Supervisor',
    department: 'Logistics & Delivery',
    type: 'Resignation',
    initiationDate: '2026-07-20',
    noticePeriodDays: 30,
    lastWorkingDay: '2026-08-19',
    reason: 'Relocating to Bangalore for higher studies',
    status: 'Clearance In Progress',
    clearanceChecklist: {
      kitchenAssetsHandover: true,
      idBadgeAndKeys: true,
      accountsNoDues: false,
      itAccessRevoked: false
    },
    fnfSettlement: {
      unpaidSalaryDays: 20,
      unpaidSalaryAmount: 18667,
      leaveEncashmentDays: 15,
      leaveEncashmentAmount: 14000,
      noticePayAdjustment: 0,
      netFnfAmount: 32667,
      paymentStatus: 'Pending'
    },
    relievingLetterIssued: false,
    notes: 'Handover to junior logistics assistant in progress.'
  },
  {
    id: 'SEP-102',
    employeeId: 'EMP-103',
    employeeName: 'Rajesh V. Pillai',
    role: 'Procurement Lead',
    department: 'Procurement & Inventory',
    type: 'Termination',
    initiationDate: '2026-07-28',
    noticePeriodDays: 15,
    lastWorkingDay: '2026-08-12',
    reason: 'Repeated non-compliance with inventory audit protocols and vendor SLA breaches',
    status: 'Notice Period Active',
    clearanceChecklist: {
      kitchenAssetsHandover: false,
      idBadgeAndKeys: false,
      accountsNoDues: false,
      itAccessRevoked: true
    },
    fnfSettlement: {
      unpaidSalaryDays: 28,
      unpaidSalaryAmount: 29866,
      leaveEncashmentDays: 10,
      leaveEncashmentAmount: 10666,
      noticePayAdjustment: 0,
      netFnfAmount: 40532,
      paymentStatus: 'Pending'
    },
    relievingLetterIssued: false,
    notes: 'Executive order issued. System ERP access suspended.'
  }
];

export const INITIAL_APPOINTMENT_LETTERS: AppointmentLetter[] = [
  {
    id: 'AL-2026-101',
    employeeId: 'EMP-101',
    candidateName: 'Dr. Priya Nair',
    candidateEmail: 'priya@proteinbowl.in',
    candidatePhone: '+91 98470 11223',
    candidateAddress: 'Flat 4B, Skyline Apartments, MG Road, Kochi, Kerala - 682011',
    designation: 'Senior Clinical Dietitian',
    department: 'Clinical Nutrition',
    joiningDate: '2024-03-15',
    probationPeriodMonths: 3,
    workLocation: 'ProteinBites Cloud Kitchen HQ, Infopark Kochi',
    reportingManager: 'Managing Director & Chief Clinical Officer',
    employmentType: 'Full-time Probationary',
    annualCtc: 624000,
    monthlyBaseSalary: 45000,
    monthlyAllowances: 8000,
    monthlyGrossSalary: 53000,
    monthlyNetSalary: 47350,
    offerValidityDate: '2024-03-10',
    issuedDate: '2024-03-01',
    issuedBy: 'Human Resources Department, ProteinBites Cloud Kitchens',
    status: 'Accepted',
    specialTerms: 'Compliance with patient confidentiality and HIPAA-standard clinical meal mapping protocols.',
    referenceNumber: 'PB/HR/APP/2024/101'
  },
  {
    id: 'AL-2026-102',
    employeeId: 'EMP-102',
    candidateName: 'Chef Suresh Kumar',
    candidateEmail: 'suresh@proteinbowl.in',
    candidatePhone: '+91 97450 33445',
    candidateAddress: 'House No. 12, SmartCity Road, Kakkanad, Kochi, Kerala - 682030',
    designation: 'Head Kitchen Executive Chef',
    department: 'Kitchen & Culinary',
    joiningDate: '2024-01-10',
    probationPeriodMonths: 6,
    workLocation: 'ProteinBites Central Production Kitchen, Kakkanad',
    reportingManager: 'Operations Director',
    employmentType: 'Permanent Executive',
    annualCtc: 726000,
    monthlyBaseSalary: 50000,
    monthlyAllowances: 10500,
    monthlyGrossSalary: 60500,
    monthlyNetSalary: 53900,
    offerValidityDate: '2024-01-05',
    issuedDate: '2024-01-02',
    issuedBy: 'Human Resources Department, ProteinBites Cloud Kitchens',
    status: 'Accepted',
    specialTerms: 'Strict adherence to clinical hygiene standards and recipe confidentiality agreements.',
    referenceNumber: 'PB/HR/APP/2024/102'
  }
];

export const HRMModule: React.FC<HRMModuleProps> = ({
  onSwitchRole,
  onLoginAsStaff
}) => {
  const [hrmTab, setHrmTab] = useState<'profiles' | 'payroll' | 'attendance' | 'payslips' | 'resignation' | 'appointment'>('profiles');

  // Staff State
  const [staffList, setStaffList] = useState<StaffEmployee[]>(INITIAL_STAFF);
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>('All');
  const [loginFeedback, setLoginFeedback] = useState<string | null>(null);

  const handleEmployeeLogin = (emp: StaffEmployee) => {
    try {
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
    } catch {
      // Ignore if unavailable
    }

    if (onLoginAsStaff) {
      onLoginAsStaff(emp);
    }

    if (onSwitchRole) {
      if (emp.id === 'EMP-105' || (emp.department === 'Kerala Mess & Hostel Ops' && emp.role.toLowerCase().includes('chef'))) {
        onSwitchRole('chef');
      } else if (emp.id === 'EMP-106' || emp.role.toLowerCase().includes('hostel') || emp.role.toLowerCase().includes('mess')) {
        onSwitchRole('mess_customer');
      } else if (emp.id === 'EMP-107' || emp.role.toLowerCase().includes('nutrition') || emp.role.toLowerCase().includes('diet')) {
        onSwitchRole('nutritionist');
      } else if (emp.role.toLowerCase().includes('chef') || emp.department === 'Kitchen & Culinary') {
        onSwitchRole('chef');
      } else if (emp.role.toLowerCase().includes('nutrition') || emp.department === 'Clinical Nutrition') {
        onSwitchRole('nutritionist');
      } else if (emp.role.toLowerCase().includes('delivery') || emp.department === 'Logistics & Delivery') {
        onSwitchRole('delivery');
      } else if (emp.role.toLowerCase().includes('procurement') || emp.department === 'Procurement & Inventory') {
        onSwitchRole('procurement');
      } else if (emp.role.toLowerCase().includes('pos') || emp.role.toLowerCase().includes('cashier')) {
        onSwitchRole('pos');
      } else {
        onSwitchRole('chef');
      }
    }

    setLoginFeedback(`Successfully logged into ${emp.name}'s workspace (${emp.department} • ${emp.role})`);
    setTimeout(() => setLoginFeedback(null), 5000);
  };

  // Add Employee Modal
  const [isAddEmployeeOpen, setIsAddEmployeeOpen] = useState(false);
  const [newEmp, setNewEmp] = useState({
    name: '',
    role: '',
    department: 'Kitchen & Culinary' as StaffEmployee['department'],
    email: '',
    phone: '',
    dateOfJoining: '2026-07-01',
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    panNumber: '',
    baseSalary: '30000',
    travelAllowance: '2000',
    medicalAllowance: '1500',
    phoneAllowance: '800',
    pfDeduction: '2400',
    esiDeduction: '250',
    ptDeduction: '200',
    tdsDeduction: '0'
  });

  // Selected Employee for View / Edit Modal
  const [selectedEmp, setSelectedEmp] = useState<StaffEmployee | null>(null);

  // Edit Payroll Modal
  const [editingPayrollEmp, setEditingPayrollEmp] = useState<StaffEmployee | null>(null);

  // Attendance State
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>(INITIAL_ATTENDANCE);
  const [selectedAttDate, setSelectedAttDate] = useState<string>('2026-07-29');

  // Leave State
  const [leaves, setLeaves] = useState<LeaveApplication[]>(INITIAL_LEAVES);
  const [isApplyLeaveOpen, setIsApplyLeaveOpen] = useState(false);
  const [newLeave, setNewLeave] = useState({
    employeeId: 'EMP-101',
    leaveType: 'Casual' as LeaveApplication['leaveType'],
    startDate: '2026-08-05',
    endDate: '2026-08-05',
    reason: ''
  });

  // Payslip State
  const [selectedPayslipEmp, setSelectedPayslipEmp] = useState<StaffEmployee | null>(INITIAL_STAFF[0]);
  const [payslipMonth, setPayslipMonth] = useState('July 2026');
  const [isPayslipModalOpen, setIsPayslipModalOpen] = useState(false);

  // Resignation & Termination State
  const [separations, setSeparations] = useState<SeparationRecord[]>(INITIAL_SEPARATIONS);
  const [isInitiateSeparationOpen, setIsInitiateSeparationOpen] = useState(false);
  const [separationForm, setSeparationForm] = useState({
    employeeId: 'EMP-101',
    type: 'Resignation' as SeparationRecord['type'],
    noticePeriodDays: 30,
    reason: '',
    revokeItImmediately: false
  });

  // NOC Clearance, FNF, and Relieving Certificate Modals
  const [selectedNocRecord, setSelectedNocRecord] = useState<SeparationRecord | null>(null);
  const [selectedFnfRecord, setSelectedFnfRecord] = useState<SeparationRecord | null>(null);
  const [selectedCertRecord, setSelectedCertRecord] = useState<SeparationRecord | null>(null);

  // Appointment Letter State
  const [appointmentLetters, setAppointmentLetters] = useState<AppointmentLetter[]>(INITIAL_APPOINTMENT_LETTERS);
  const [isIssueLetterModalOpen, setIsIssueLetterModalOpen] = useState(false);
  const [selectedAppointmentLetter, setSelectedAppointmentLetter] = useState<AppointmentLetter | null>(null);

  const [letterForm, setLetterForm] = useState({
    candidateSource: 'new' as 'new' | string,
    candidateName: '',
    candidateEmail: '',
    candidatePhone: '',
    candidateAddress: '',
    designation: 'Clinical Dietitian',
    department: 'Clinical Nutrition' as StaffEmployee['department'],
    joiningDate: '2026-08-15',
    probationPeriodMonths: 3,
    workLocation: 'ProteinBites Cloud Kitchen HQ, Infopark Kochi',
    reportingManager: 'Managing Director & Chief Clinical Officer',
    employmentType: 'Full-time Probationary' as AppointmentLetter['employmentType'],
    monthlyBaseSalary: 35000,
    monthlyAllowances: 5000,
    specialTerms: 'Strict compliance with patient clinical privacy, hygiene standards, and food safety guidelines.'
  });

  const [letterSearchQuery, setLetterSearchQuery] = useState('');
  const [letterStatusFilter, setLetterStatusFilter] = useState<string>('All');

  const handleCandidateSourceChange = (source: string) => {
    if (source === 'new') {
      setLetterForm((prev) => ({
        ...prev,
        candidateSource: 'new',
        candidateName: '',
        candidateEmail: '',
        candidatePhone: '',
        candidateAddress: ''
      }));
    } else {
      const emp = staffList.find((s) => s.id === source);
      if (emp) {
        const allowances = (emp.payrollSetup.travelAllowance || 0) + (emp.payrollSetup.medicalAllowance || 0) + (emp.payrollSetup.phoneAllowance || 0) + (emp.payrollSetup.specialBonus || 0);
        setLetterForm((prev) => ({
          ...prev,
          candidateSource: emp.id,
          candidateName: emp.name,
          candidateEmail: emp.email,
          candidatePhone: emp.phone,
          candidateAddress: 'Infopark Staff Quarters, Kakkanad, Kochi',
          designation: emp.role,
          department: emp.department,
          monthlyBaseSalary: emp.payrollSetup.baseSalary,
          monthlyAllowances: allowances
        }));
      }
    }
  };

  const handleCreateAppointmentLetter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!letterForm.candidateName || !letterForm.candidateEmail) return;

    const base = Number(letterForm.monthlyBaseSalary) || 0;
    const allowances = Number(letterForm.monthlyAllowances) || 0;
    const monthlyGross = base + allowances;
    const monthlyNet = Math.round(monthlyGross * 0.9);
    const annualCtc = monthlyGross * 12;
    const nextNum = 101 + appointmentLetters.length;
    const refNo = `PB/HR/APP/2026/${nextNum}`;

    const newLetter: AppointmentLetter = {
      id: `AL-2026-${nextNum}`,
      employeeId: letterForm.candidateSource !== 'new' ? letterForm.candidateSource : undefined,
      candidateName: letterForm.candidateName,
      candidateEmail: letterForm.candidateEmail,
      candidatePhone: letterForm.candidatePhone || '+91 98765 43210',
      candidateAddress: letterForm.candidateAddress || 'Ernakulam, Kochi, Kerala - 682016',
      designation: letterForm.designation,
      department: letterForm.department,
      joiningDate: letterForm.joiningDate,
      probationPeriodMonths: Number(letterForm.probationPeriodMonths),
      workLocation: letterForm.workLocation,
      reportingManager: letterForm.reportingManager,
      employmentType: letterForm.employmentType,
      annualCtc,
      monthlyBaseSalary: base,
      monthlyAllowances: allowances,
      monthlyGrossSalary: monthlyGross,
      monthlyNetSalary: monthlyNet,
      offerValidityDate: new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0],
      issuedDate: new Date().toISOString().split('T')[0],
      issuedBy: 'Human Resources Department, ProteinBites Cloud Kitchens',
      status: 'Issued',
      specialTerms: letterForm.specialTerms,
      referenceNumber: refNo
    };

    setAppointmentLetters([newLetter, ...appointmentLetters]);
    setIsIssueLetterModalOpen(false);
    setSelectedAppointmentLetter(newLetter);
    confetti({ particleCount: 60, spread: 70 });
  };

  const handleGenerateLetterForStaff = (emp: StaffEmployee) => {
    const allowances = (emp.payrollSetup.travelAllowance || 0) + (emp.payrollSetup.medicalAllowance || 0) + (emp.payrollSetup.phoneAllowance || 0) + (emp.payrollSetup.specialBonus || 0);
    setLetterForm({
      candidateSource: emp.id,
      candidateName: emp.name,
      candidateEmail: emp.email,
      candidatePhone: emp.phone,
      candidateAddress: 'Kochi HQ Staff Residences, Ernakulam, Kerala',
      designation: emp.role,
      department: emp.department,
      joiningDate: emp.dateOfJoining || '2026-08-01',
      probationPeriodMonths: 3,
      workLocation: 'ProteinBites Cloud Kitchen HQ, Infopark Kochi',
      reportingManager: 'Managing Director & Operations Head',
      employmentType: 'Full-time Probationary',
      monthlyBaseSalary: emp.payrollSetup.baseSalary,
      monthlyAllowances: allowances,
      specialTerms: 'Strict compliance with nutritional guidelines, patient health privacy, and kitchen hygiene protocols.'
    });
    setHrmTab('appointment');
    setIsIssueLetterModalOpen(true);
  };

  // Filter staff members
  const filteredStaff = staffList.filter((emp) => {
    const matchesSearch = emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          emp.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          emp.role.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept = deptFilter === 'All' || emp.department === deptFilter;
    return matchesSearch && matchesDept;
  });

  // Calculate gross, deduction, net for a staff
  const getPayrollDetails = (emp: StaffEmployee) => {
    const p = emp.payrollSetup;
    const allowancesTotal = (p.travelAllowance || 0) + (p.medicalAllowance || 0) + (p.phoneAllowance || 0) + (p.specialBonus || 0);
    const grossEarnings = (p.baseSalary || 0) + allowancesTotal;
    const deductionsTotal = (p.pfDeduction || 0) + (p.esiDeduction || 0) + (p.ptDeduction || 0) + (p.tdsDeduction || 0);
    const netPayable = grossEarnings - deductionsTotal;
    return { allowancesTotal, grossEarnings, deductionsTotal, netPayable };
  };

  // Total payroll liability across all staff
  const totalGrossPayroll = staffList.reduce((sum, e) => sum + getPayrollDetails(e).grossEarnings, 0);
  const totalNetPayroll = staffList.reduce((sum, e) => sum + getPayrollDetails(e).netPayable, 0);
  const totalDeductionsLiability = staffList.reduce((sum, e) => sum + getPayrollDetails(e).deductionsTotal, 0);

  // Handlers
  const handleCreateEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmp.name || !newEmp.email) return;

    const empId = `EMP-${100 + staffList.length + 1}`;
    const created: StaffEmployee = {
      id: empId,
      name: newEmp.name,
      role: newEmp.role || 'Staff Specialist',
      department: newEmp.department,
      email: newEmp.email,
      phone: newEmp.phone || '+91 98000 00000',
      dateOfJoining: newEmp.dateOfJoining,
      status: 'Active',
      bankDetails: {
        bankName: newEmp.bankName || 'HDFC Bank, Kochi',
        accountNumber: newEmp.accountNumber || '1029384756',
        ifscCode: newEmp.ifscCode || 'HDFC0001111',
        panNumber: newEmp.panNumber || 'ABCDE9999Z',
        upiId: `${newEmp.name.toLowerCase().replace(/\s+/g, '')}@upi`
      },
      payrollSetup: {
        baseSalary: Number(newEmp.baseSalary) || 30000,
        travelAllowance: Number(newEmp.travelAllowance) || 2000,
        medicalAllowance: Number(newEmp.medicalAllowance) || 1500,
        phoneAllowance: Number(newEmp.phoneAllowance) || 800,
        specialBonus: 0,
        pfDeduction: Number(newEmp.pfDeduction) || 2400,
        esiDeduction: Number(newEmp.esiDeduction) || 250,
        ptDeduction: Number(newEmp.ptDeduction) || 200,
        tdsDeduction: Number(newEmp.tdsDeduction) || 0
      },
      leaveBalance: {
        casualLeaveRemaining: 12,
        sickLeaveRemaining: 8,
        earnedLeaveRemaining: 15
      }
    };

    setStaffList([...staffList, created]);
    setIsAddEmployeeOpen(false);
    confetti({ particleCount: 50, spread: 60 });
  };

  const handleUpdatePayroll = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPayrollEmp) return;

    setStaffList(staffList.map((s) => (s.id === editingPayrollEmp.id ? editingPayrollEmp : s)));
    setEditingPayrollEmp(null);
    confetti({ particleCount: 30, spread: 40 });
  };

  const handleToggleAttendance = (empId: string, status: AttendanceRecord['status']) => {
    const existing = attendanceRecords.find((a) => a.employeeId === empId && a.date === selectedAttDate);
    const emp = staffList.find((s) => s.id === empId);
    if (!emp) return;

    if (existing) {
      setAttendanceRecords(
        attendanceRecords.map((a) =>
          a.employeeId === empId && a.date === selectedAttDate ? { ...a, status } : a
        )
      );
    } else {
      const newRecord: AttendanceRecord = {
        id: `att-${Date.now()}`,
        employeeId: empId,
        employeeName: emp.name,
        date: selectedAttDate,
        status,
        checkInTime: status === 'Present' || status === 'Half Day' ? '09:00 AM' : undefined,
        checkOutTime: status === 'Present' || status === 'Half Day' ? '06:00 PM' : undefined
      };
      setAttendanceRecords([...attendanceRecords, newRecord]);
    }
  };

  const handleLeaveAction = (leaveId: string, action: 'Approved' | 'Rejected') => {
    setLeaves(
      leaves.map((l) => (l.id === leaveId ? { ...l, status: action, reviewedBy: 'Managing Director' } : l))
    );
    if (action === 'Approved') {
      confetti({ particleCount: 40, spread: 50 });
    }
  };

  const handleCreateLeave = (e: React.FormEvent) => {
    e.preventDefault();
    const emp = staffList.find((s) => s.id === newLeave.employeeId);
    if (!emp) return;

    const leaveApp: LeaveApplication = {
      id: `lv-${Date.now()}`,
      employeeId: emp.id,
      employeeName: emp.name,
      role: emp.role,
      leaveType: newLeave.leaveType,
      startDate: newLeave.startDate,
      endDate: newLeave.endDate,
      totalDays: 1,
      reason: newLeave.reason || 'Personal work',
      status: 'Pending',
      appliedOn: new Date().toISOString().split('T')[0]
    };

    setLeaves([leaveApp, ...leaves]);
    setIsApplyLeaveOpen(false);
    confetti({ particleCount: 30, spread: 40 });
  };

  const handlePrintPayslip = () => {
    window.print();
  };

  // Separation Handlers
  const handleInitiateSeparationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const emp = staffList.find((s) => s.id === separationForm.employeeId);
    if (!emp) return;

    const today = new Date();
    const lastDay = new Date();
    lastDay.setDate(today.getDate() + Number(separationForm.noticePeriodDays));

    const dailySalary = (emp.payrollSetup?.baseSalary || 30000) / 30;
    const unpaidSalaryDays = Math.min(20, Number(separationForm.noticePeriodDays));
    const unpaidSalaryAmount = Math.round(unpaidSalaryDays * dailySalary);
    const leaveEncashmentDays = emp.leaveBalance?.casualLeaveRemaining || 10;
    const leaveEncashmentAmount = Math.round(leaveEncashmentDays * dailySalary);
    const netFnf = unpaidSalaryAmount + leaveEncashmentAmount;

    const newRecord: SeparationRecord = {
      id: `SEP-${100 + separations.length + 1}`,
      employeeId: emp.id,
      employeeName: emp.name,
      role: emp.role,
      department: emp.department,
      type: separationForm.type,
      initiationDate: today.toISOString().split('T')[0],
      noticePeriodDays: Number(separationForm.noticePeriodDays),
      lastWorkingDay: lastDay.toISOString().split('T')[0],
      reason: separationForm.reason || (separationForm.type === 'Resignation' ? 'Personal reasons submitted by employee' : 'Executive termination order issued by MD'),
      status: 'Notice Period Active',
      clearanceChecklist: {
        kitchenAssetsHandover: false,
        idBadgeAndKeys: false,
        accountsNoDues: false,
        itAccessRevoked: separationForm.revokeItImmediately
      },
      fnfSettlement: {
        unpaidSalaryDays,
        unpaidSalaryAmount,
        leaveEncashmentDays,
        leaveEncashmentAmount,
        noticePayAdjustment: 0,
        netFnfAmount: netFnf,
        paymentStatus: 'Pending'
      },
      relievingLetterIssued: false,
      notes: separationForm.type === 'Termination' ? 'Executive order issued. Notice period enforced.' : 'Resignation notice logged.'
    };

    setSeparations([newRecord, ...separations]);

    // Update employee status in Staff Directory
    setStaffList(
      staffList.map((s) =>
        s.id === emp.id
          ? { ...s, status: separationForm.type === 'Termination' ? 'Terminated' : 'In Notice Period' }
          : s
      )
    );

    setIsInitiateSeparationOpen(false);
    confetti({ particleCount: 40, spread: 50 });
  };

  const handleToggleNocCheck = (recId: string, item: keyof SeparationRecord['clearanceChecklist']) => {
    const updatedList = separations.map((sep) => {
      if (sep.id === recId) {
        const updatedChecklist = { ...sep.clearanceChecklist, [item]: !sep.clearanceChecklist[item] };
        const allDone = Object.values(updatedChecklist).every(Boolean);
        return {
          ...sep,
          clearanceChecklist: updatedChecklist,
          status: (allDone ? 'Clearance In Progress' : sep.status) as SeparationRecord['status']
        };
      }
      return sep;
    });

    setSeparations(updatedList);

    if (selectedNocRecord && selectedNocRecord.id === recId) {
      const updatedChecklist = { ...selectedNocRecord.clearanceChecklist, [item]: !selectedNocRecord.clearanceChecklist[item] };
      setSelectedNocRecord({
        ...selectedNocRecord,
        clearanceChecklist: updatedChecklist
      });
    }
  };

  const handleMarkFnfSettled = (recId: string) => {
    const today = new Date().toISOString().split('T')[0];
    const updatedList = separations.map((sep) =>
      sep.id === recId
        ? {
            ...sep,
            fnfSettlement: { ...sep.fnfSettlement, paymentStatus: 'Settled' as const, settledOn: today }
          }
        : sep
    );

    setSeparations(updatedList);

    if (selectedFnfRecord && selectedFnfRecord.id === recId) {
      setSelectedFnfRecord({
        ...selectedFnfRecord,
        fnfSettlement: { ...selectedFnfRecord.fnfSettlement, paymentStatus: 'Settled', settledOn: today }
      });
    }

    confetti({ particleCount: 50, spread: 60 });
  };

  const handleFinalizeExit = (rec: SeparationRecord) => {
    setSeparations(
      separations.map((s) => (s.id === rec.id ? { ...s, status: 'Exit Completed', relievingLetterIssued: true } : s))
    );

    setStaffList(
      staffList.map((s) =>
        s.id === rec.employeeId
          ? { ...s, status: rec.type === 'Termination' ? 'Terminated' : 'Resigned' }
          : s
      )
    );

    confetti({ particleCount: 60, spread: 70 });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-stone-900 via-amber-950 to-stone-900 text-white p-6 rounded-3xl border border-amber-800/60 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-3 py-0.5 rounded-full bg-amber-400 text-emerald-950 font-black text-[10px] uppercase tracking-wider">
              MD Portal Sub-Module
            </span>
            <span className="text-xs text-amber-200">ProteinBites Cloud Kitchen HR & Payroll System</span>
          </div>
          <h2 className="text-2xl font-black tracking-tight text-white">Human Resource Management (HRM)</h2>
          <p className="text-xs text-stone-300 mt-0.5">
            Manage Staff Profiles, Payroll Breakdown, Daily Attendance, Leaves, Payslips & Resignation/Termination Protocol.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setIsAddEmployeeOpen(true)}
            className="bg-amber-400 hover:bg-amber-300 text-emerald-950 font-black px-4 py-2 rounded-2xl text-xs flex items-center gap-2 shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add Staff Member</span>
          </button>
        </div>
      </div>

      {/* HRM Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 pb-2">
        {[
          { id: 'profiles', label: '1. Staff Profiles', icon: Users, badge: staffList.length },
          { id: 'payroll', label: '2. Payroll Setup & Matrix', icon: DollarSign, badge: `₹${(totalNetPayroll / 1000).toFixed(0)}k` },
          { id: 'attendance', label: '3. Attendance & Leaves', icon: Calendar, badge: `${leaves.filter((l) => l.status === 'Pending').length} Pending` },
          { id: 'payslips', label: '4. Automated PDF Payslips', icon: FileText, badge: 'Generate' },
          { id: 'resignation', label: '5. Resignation & Termination', icon: ShieldAlert, badge: `${separations.filter((s) => s.status !== 'Exit Completed').length} Active` },
          { id: 'appointment', label: '6. Issue Appointment Letter', icon: FileCheck, badge: `${appointmentLetters.length} Issued` },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = hrmTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setHrmTab(tab.id as any)}
              className={`px-4 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center gap-2 border ${
                active
                  ? 'bg-amber-900 text-white border-amber-900 shadow-md'
                  : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
              }`}
            >
              <Icon className={`w-4 h-4 ${active ? 'text-amber-300' : 'text-stone-500'}`} />
              <span>{tab.label}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                active ? 'bg-amber-400 text-emerald-950' : 'bg-stone-100 text-stone-600'
              }`}>
                {tab.badge}
              </span>
            </button>
          );
        })}
      </div>

      {/* ========================================================= */}
      {/* SUB-TAB 1: STAFF PROFILES */}
      {/* ========================================================= */}
      {hrmTab === 'profiles' && (
        <div className="space-y-6">
          {/* Controls & Filter */}
          <div className="bg-white p-4 rounded-2xl border border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search by Employee Name, ID, or Role..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-stone-50 border border-stone-300 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 font-medium"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="font-bold text-stone-500 text-[11px] uppercase shrink-0">Department:</span>
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="p-2 bg-stone-50 border border-stone-300 rounded-xl outline-none font-bold text-stone-800 focus:ring-2 focus:ring-amber-500"
              >
                <option value="All">All Departments ({staffList.length})</option>
                <option value="Kerala Mess & Hostel Ops">🍛 Kerala Mess & Hostel Ops</option>
                <option value="Kitchen & Culinary">Kitchen & Culinary</option>
                <option value="Clinical Nutrition">Clinical Nutrition</option>
                <option value="Procurement & Inventory">Procurement & Inventory</option>
                <option value="Logistics & Delivery">Logistics & Delivery</option>
                <option value="Administration">Administration</option>
              </select>
            </div>
          </div>

          {/* Login Notification Toast */}
          {loginFeedback && (
            <div className="bg-emerald-900 text-white px-4 py-3 rounded-2xl border border-emerald-500/50 shadow-md flex items-center justify-between animate-fadeIn">
              <div className="flex items-center gap-2 text-xs font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                <span>{loginFeedback}</span>
              </div>
              <button onClick={() => setLoginFeedback(null)} className="text-emerald-300 hover:text-white text-xs font-bold">
                Dismiss
              </button>
            </div>
          )}

          {/* Kerala Mess Department Login Quick Access Panel */}
          {(deptFilter === 'All' || deptFilter === 'Kerala Mess & Hostel Ops') && (
            <div className="bg-gradient-to-r from-amber-950 via-stone-900 to-amber-900 text-white p-5 rounded-3xl border border-amber-700/60 shadow-md space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center justify-center font-black text-xl">
                    🍛
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-black text-white">Kerala Mess Department – Employee Portal Logins</h4>
                      <span className="text-[10px] font-black uppercase bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-md border border-amber-500/30">
                        Staff Auth Terminals
                      </span>
                    </div>
                    <p className="text-xs text-stone-300">
                      Direct single-click login into Kerala Mess kitchen kettles, hostel crate logistics, and student mess operations.
                    </p>
                  </div>
                </div>
              </div>

              {/* Quick Login Terminals for Kerala Mess Personnel */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                <button
                  onClick={() => {
                    const murugan = staffList.find(s => s.id === 'EMP-105') || {
                      id: 'EMP-105',
                      name: 'Chef Murugan K.',
                      role: 'Lead Chef - Kerala Mess & Kettles',
                      department: 'Kerala Mess & Hostel Ops' as const,
                      email: 'murugan.mess@proteinbowl.in',
                      phone: '+91 94470 66778',
                      dateOfJoining: '2024-03-01',
                      status: 'Active' as const,
                      bankDetails: {
                        bankName: 'Federal Bank',
                        accountNumber: '11820100482910',
                        ifscCode: 'FDRL0001182',
                        panNumber: 'AYIPM8891K'
                      },
                      salaryStructure: {
                        baseSalary: 45000,
                        allowances: { travel: 3000, medical: 2000, telephone: 1000, specialAllowance: 4000 },
                        deductions: { pf: 3600, esi: 0, pt: 200, tds: 1000 }
                      }
                    };
                    handleEmployeeLogin(murugan);
                  }}
                  className="bg-stone-900/90 hover:bg-amber-900/60 p-3.5 rounded-2xl border border-amber-600/40 text-left transition-all group flex flex-col justify-between hover:border-amber-400"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-700/50">
                        EMP-105 • Chef KDS
                      </span>
                      <ChefHat className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                    </div>
                    <h5 className="font-extrabold text-white text-xs mt-1">Chef Murugan K.</h5>
                    <p className="text-[11px] text-stone-300 line-clamp-1">Kettle Steam Line, Sambar/Avial & Menu Prep</p>
                  </div>
                  <div className="mt-3 pt-2 border-t border-amber-800/40 flex items-center justify-between text-[11px] font-black text-amber-300 group-hover:text-amber-200">
                    <span>Login to Mess KDS</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>

                <button
                  onClick={() => {
                    const ananthan = staffList.find(s => s.id === 'EMP-106') || {
                      id: 'EMP-106',
                      name: 'Ananthan V. Menon',
                      role: 'Kerala Mess Operations & Logistics Lead',
                      department: 'Kerala Mess & Hostel Ops' as const,
                      email: 'ananthan.mess@proteinbowl.in',
                      phone: '+91 98950 44332',
                      dateOfJoining: '2024-04-15',
                      status: 'Active' as const,
                      bankDetails: {
                        bankName: 'State Bank of India',
                        accountNumber: '39948271049',
                        ifscCode: 'SBIN0008472',
                        panNumber: 'BKMPA4481M'
                      },
                      salaryStructure: {
                        baseSalary: 42000,
                        allowances: { travel: 4500, medical: 1500, telephone: 1200, specialAllowance: 2800 },
                        deductions: { pf: 3360, esi: 0, pt: 200, tds: 800 }
                      }
                    };
                    handleEmployeeLogin(ananthan);
                  }}
                  className="bg-stone-900/90 hover:bg-amber-900/60 p-3.5 rounded-2xl border border-amber-600/40 text-left transition-all group flex flex-col justify-between hover:border-amber-400"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-700/50">
                        EMP-106 • Hostel Ops
                      </span>
                      <Truck className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                    </div>
                    <h5 className="font-extrabold text-white text-xs mt-1">Ananthan V. Menon</h5>
                    <p className="text-[11px] text-stone-300 line-clamp-1">Hostel Delivery Crates, QR Passes & Subs</p>
                  </div>
                  <div className="mt-3 pt-2 border-t border-amber-800/40 flex items-center justify-between text-[11px] font-black text-emerald-300 group-hover:text-emerald-200">
                    <span>Login to Hostel Logistics</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>

                <button
                  onClick={() => {
                    const lekshmi = staffList.find(s => s.id === 'EMP-107') || {
                      id: 'EMP-107',
                      name: 'Lekshmi Devi R.',
                      role: 'Mess Nutritional Standards & Recipe Auditor',
                      department: 'Kerala Mess & Hostel Ops' as const,
                      email: 'lekshmi@proteinbowl.in',
                      phone: '+91 97440 88991',
                      dateOfJoining: '2024-05-01',
                      status: 'Active' as const,
                      bankDetails: {
                        bankName: 'Canara Bank',
                        accountNumber: '0812101039481',
                        ifscCode: 'CNRB0000812',
                        panNumber: 'CXRPL9920L'
                      },
                      salaryStructure: {
                        baseSalary: 40000,
                        allowances: { travel: 2500, medical: 2000, telephone: 1000, specialAllowance: 2500 },
                        deductions: { pf: 3200, esi: 0, pt: 200, tds: 600 }
                      }
                    };
                    handleEmployeeLogin(lekshmi);
                  }}
                  className="bg-stone-900/90 hover:bg-amber-900/60 p-3.5 rounded-2xl border border-amber-600/40 text-left transition-all group flex flex-col justify-between hover:border-amber-400"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase text-teal-400 bg-teal-950/80 px-2 py-0.5 rounded border border-teal-700/50">
                        EMP-107 • Diet Auditor
                      </span>
                      <Utensils className="w-4 h-4 text-teal-400 group-hover:scale-110 transition-transform" />
                    </div>
                    <h5 className="font-extrabold text-white text-xs mt-1">Lekshmi Devi R.</h5>
                    <p className="text-[11px] text-stone-300 line-clamp-1">Traditional Homestyle Diet Audits & Recipes</p>
                  </div>
                  <div className="mt-3 pt-2 border-t border-amber-800/40 flex items-center justify-between text-[11px] font-black text-teal-300 group-hover:text-teal-200">
                    <span>Login to Diet Auditor</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Staff Employee Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
            {filteredStaff.map((emp) => {
              const { grossEarnings, netPayable } = getPayrollDetails(emp);
              const isMessEmp = emp.department === 'Kerala Mess & Hostel Ops';
              return (
                <div
                  key={emp.id}
                  className={`bg-white rounded-3xl border p-5 space-y-4 hover:shadow-md transition-all relative overflow-hidden ${
                    isMessEmp ? 'border-amber-300 ring-1 ring-amber-200' : 'border-stone-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-2xl text-white font-black text-lg flex items-center justify-center shadow-xs ${
                        isMessEmp 
                          ? 'bg-gradient-to-br from-amber-600 to-amber-900' 
                          : 'bg-gradient-to-br from-stone-700 to-stone-900'
                      }`}>
                        {emp.name.split(' ').map((n) => n[0]).join('')}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                            isMessEmp 
                              ? 'bg-amber-100 text-amber-900 border-amber-300' 
                              : 'bg-stone-100 text-stone-800 border-stone-200'
                          }`}>
                            {emp.id}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                            {emp.status}
                          </span>
                          {isMessEmp && (
                            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500 text-white">
                              Mess Dept
                            </span>
                          )}
                        </div>
                        <h3 className="font-black text-stone-900 text-base leading-snug mt-0.5">{emp.name}</h3>
                        <p className={`text-xs font-bold ${isMessEmp ? 'text-amber-800' : 'text-stone-600'}`}>{emp.role}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleEmployeeLogin(emp)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-xs ${
                          isMessEmp 
                            ? 'bg-amber-900 hover:bg-amber-800 text-white' 
                            : 'bg-stone-900 hover:bg-stone-800 text-white'
                        }`}
                        title="Login as this staff member"
                      >
                        <Key className="w-3.5 h-3.5 text-amber-300" />
                        <span>Login</span>
                      </button>
                      <button
                        onClick={() => setSelectedEmp(emp)}
                        className="px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-bold transition-all"
                      >
                        Profile
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs bg-stone-50 p-3 rounded-2xl border border-stone-200/80">
                    <div>
                      <span className="text-[10px] text-stone-400 uppercase font-bold block">Department</span>
                      <strong className={`font-extrabold ${isMessEmp ? 'text-amber-900' : 'text-stone-800'}`}>{emp.department}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-stone-400 uppercase font-bold block">Date Joined</span>
                      <strong className="text-stone-800 font-extrabold">{emp.dateOfJoining}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-stone-400 uppercase font-bold block">Net Salary</span>
                      <strong className="text-emerald-800 font-black">₹{netPayable.toLocaleString()} / mo</strong>
                    </div>
                  </div>

                  {/* Bank Details Snippet */}
                  <div className="text-[11px] text-stone-600 bg-amber-50/50 p-3 rounded-2xl border border-amber-200/60 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-amber-800 shrink-0" />
                      <div>
                        <span className="font-bold text-stone-800 block">{emp.bankDetails.bankName}</span>
                        <span className="text-[10px] text-stone-500">A/C: {emp.bankDetails.accountNumber} • IFSC: {emp.bankDetails.ifscCode}</span>
                      </div>
                    </div>
                    <span className="text-[10px] font-black uppercase text-amber-900 bg-amber-200/60 px-2 py-0.5 rounded-md">
                      PAN: {emp.bankDetails.panNumber}
                    </span>
                  </div>

                  {/* Quick Action: Issue Appointment Letter & Login */}
                  <div className="pt-2 border-t border-stone-100 flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleGenerateLetterForStaff(emp)}
                      className="w-1/2 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 font-black rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs"
                    >
                      <FileCheck className="w-3.5 h-3.5 text-stone-600" />
                      <span>Appointment Letter</span>
                    </button>
                    <button
                      onClick={() => handleEmployeeLogin(emp)}
                      className={`w-1/2 py-2 font-black rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs ${
                        isMessEmp 
                          ? 'bg-amber-900 hover:bg-amber-800 text-white' 
                          : 'bg-emerald-800 hover:bg-emerald-700 text-white'
                      }`}
                    >
                      <Key className="w-3.5 h-3.5 text-amber-300" />
                      <span>{isMessEmp ? 'Mess Staff Login' : 'Launch Workspace'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SUB-TAB 2: PAYROLL SETUP & MATRIX */}
      {/* ========================================================= */}
      {hrmTab === 'payroll' && (
        <div className="space-y-6">
          {/* Aggregate Payroll Liability Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-2xs space-y-1">
              <span className="text-[11px] font-bold text-stone-400 uppercase">Gross Monthly Payroll</span>
              <div className="text-2xl font-black text-stone-900">₹{totalGrossPayroll.toLocaleString()}</div>
              <span className="text-[10px] text-stone-500">Sum of Basic + All Allowances</span>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-2xs space-y-1">
              <span className="text-[11px] font-bold text-stone-400 uppercase">Statutory Deductions</span>
              <div className="text-2xl font-black text-rose-700">₹{totalDeductionsLiability.toLocaleString()}</div>
              <span className="text-[10px] text-stone-500">PF, ESI, PT & TDS Pool</span>
            </div>

            <div className="bg-emerald-950 text-white p-5 rounded-3xl border border-emerald-900 shadow-2xs space-y-1">
              <span className="text-[11px] font-bold text-amber-400 uppercase">Net Monthly Disbursal</span>
              <div className="text-2xl font-black text-amber-300">₹{totalNetPayroll.toLocaleString()}</div>
              <span className="text-[10px] text-emerald-200">Direct Bank Outflow per Month</span>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-2xs space-y-1">
              <span className="text-[11px] font-bold text-stone-400 uppercase">Active Employee Count</span>
              <div className="text-2xl font-black text-amber-900">{staffList.length} Staff</div>
              <span className="text-[10px] text-emerald-700 font-bold">100% On-Time Disbursal</span>
            </div>
          </div>

          {/* Interactive Payroll Matrix Table */}
          <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-xs">
            <div className="p-4 bg-stone-50 border-b border-stone-200 flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-stone-900 text-sm">Employee Payroll Breakdown Matrix</h3>
                <p className="text-[11px] text-stone-500">Itemized Basic, Allowances, Statutory Deductions & Net Pay</p>
              </div>
              <span className="text-xs font-extrabold text-amber-800 bg-amber-100 px-3 py-1 rounded-full border border-amber-200">
                Monthly Frequency
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-stone-100 text-stone-600 font-bold uppercase text-[10px] tracking-wider border-b border-stone-200">
                    <th className="p-3">Employee</th>
                    <th className="p-3">Base Salary</th>
                    <th className="p-3">Allowances (Travel/Med/Phone/Bonus)</th>
                    <th className="p-3">Gross Earnings</th>
                    <th className="p-3">Deductions (PF/ESI/PT/TDS)</th>
                    <th className="p-3">Net Payable</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 font-medium text-stone-800">
                  {staffList.map((emp) => {
                    const { allowancesTotal, grossEarnings, deductionsTotal, netPayable } = getPayrollDetails(emp);
                    const p = emp.payrollSetup;
                    return (
                      <tr key={emp.id} className="hover:bg-stone-50/80 transition-colors">
                        <td className="p-3">
                          <strong className="text-stone-900 font-black block">{emp.name}</strong>
                          <span className="text-[10px] text-amber-800 font-bold">{emp.id} • {emp.role}</span>
                        </td>
                        <td className="p-3 font-bold text-stone-900">
                          ₹{p.baseSalary.toLocaleString()}
                        </td>
                        <td className="p-3">
                          <span className="font-bold text-emerald-800">+₹{allowancesTotal.toLocaleString()}</span>
                          <span className="text-[9px] text-stone-400 block">
                            Trv: {p.travelAllowance} | Med: {p.medicalAllowance} | Ph: {p.phoneAllowance}
                          </span>
                        </td>
                        <td className="p-3 font-extrabold text-stone-900">
                          ₹{grossEarnings.toLocaleString()}
                        </td>
                        <td className="p-3">
                          <span className="font-bold text-rose-700">-₹{deductionsTotal.toLocaleString()}</span>
                          <span className="text-[9px] text-stone-400 block">
                            PF: {p.pfDeduction} | ESI: {p.esiDeduction} | PT: {p.ptDeduction} | TDS: {p.tdsDeduction}
                          </span>
                        </td>
                        <td className="p-3 font-black text-emerald-800 text-sm">
                          ₹{netPayable.toLocaleString()}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => setEditingPayrollEmp(emp)}
                            className="px-3 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-xl text-xs font-bold transition-all"
                          >
                            Edit Payroll
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SUB-TAB 3: ATTENDANCE & LEAVES */}
      {/* ========================================================= */}
      {hrmTab === 'attendance' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Daily Attendance Logger */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-3">
                <div>
                  <h3 className="font-black text-stone-900 text-base">Daily Check-In & Attendance Logger</h3>
                  <p className="text-xs text-stone-500">Record employee daily check-in status and work hours</p>
                </div>
                
                <input
                  type="date"
                  value={selectedAttDate}
                  onChange={(e) => setSelectedAttDate(e.target.value)}
                  className="p-2 bg-stone-50 border border-stone-300 rounded-xl font-bold text-xs outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Attendance Table */}
              <div className="space-y-3">
                {staffList.map((emp) => {
                  const record = attendanceRecords.find((a) => a.employeeId === emp.id && a.date === selectedAttDate);
                  const status = record?.status || 'Present';

                  return (
                    <div
                      key={emp.id}
                      className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <strong className="text-stone-900 font-extrabold block">{emp.name}</strong>
                        <span className="text-[10px] text-stone-500">{emp.id} • {emp.role}</span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {[
                          { id: 'Present', label: 'Present', color: 'bg-emerald-600 text-white' },
                          { id: 'Half Day', label: 'Half Day', color: 'bg-amber-500 text-white' },
                          { id: 'On Leave', label: 'Leave', color: 'bg-blue-600 text-white' },
                          { id: 'Absent', label: 'Absent', color: 'bg-rose-600 text-white' },
                        ].map((btn) => {
                          const active = status === btn.id;
                          return (
                            <button
                              key={btn.id}
                              type="button"
                              onClick={() => handleToggleAttendance(emp.id, btn.id as any)}
                              className={`px-2.5 py-1 rounded-xl font-bold text-[11px] transition-all border ${
                                active
                                  ? `${btn.color} border-transparent shadow-xs`
                                  : 'bg-white text-stone-600 border-stone-300 hover:bg-stone-100'
                              }`}
                            >
                              {btn.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: Leave Applications & Processing */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <div>
                  <h3 className="font-black text-stone-900 text-base">Leave Applications</h3>
                  <p className="text-xs text-stone-500">Casual, Sick & Earned Leave Approvals</p>
                </div>

                <button
                  onClick={() => setIsApplyLeaveOpen(true)}
                  className="px-3 py-1.5 bg-amber-900 text-white rounded-xl text-xs font-bold hover:bg-amber-800 transition-all flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Apply Leave
                </button>
              </div>

              <div className="space-y-3">
                {leaves.map((l) => (
                  <div
                    key={l.id}
                    className="p-4 rounded-2xl border border-stone-200 space-y-2 text-xs bg-stone-50/60"
                  >
                    <div className="flex items-center justify-between">
                      <strong className="font-extrabold text-stone-900">{l.employeeName}</strong>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                        l.status === 'Approved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : l.status === 'Rejected'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-900 animate-pulse'
                      }`}>
                        {l.status}
                      </span>
                    </div>

                    <div className="text-[11px] text-stone-600">
                      <strong>{l.leaveType} Leave</strong> • {l.startDate} to {l.endDate} ({l.totalDays} Day)
                    </div>

                    <p className="text-[11px] text-stone-500 italic bg-white p-2 rounded-xl border border-stone-200/80">
                      "{l.reason}"
                    </p>

                    {l.status === 'Pending' && (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => handleLeaveAction(l.id, 'Approved')}
                          className="flex-1 py-1.5 bg-emerald-800 text-white font-bold rounded-xl text-xs hover:bg-emerald-700 transition-all"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleLeaveAction(l.id, 'Rejected')}
                          className="flex-1 py-1.5 bg-rose-100 text-rose-800 font-bold rounded-xl text-xs hover:bg-rose-200 transition-all"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SUB-TAB 4: AUTOMATED PAYSLIPS */}
      {/* ========================================================= */}
      {hrmTab === 'payslips' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-3xl border border-stone-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-3">
              <div>
                <h3 className="font-black text-stone-900 text-base">Monthly Automated Payslips Generator</h3>
                <p className="text-xs text-stone-500">Generate, view and print official company payslips with full itemized breakdown</p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-stone-600">Period:</span>
                <select
                  value={payslipMonth}
                  onChange={(e) => setPayslipMonth(e.target.value)}
                  className="p-2 bg-stone-50 border border-stone-300 rounded-xl font-bold text-xs outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="July 2026">July 2026</option>
                  <option value="June 2026">June 2026</option>
                  <option value="May 2026">May 2026</option>
                </select>
              </div>
            </div>

            {/* Payslip Selectors Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {staffList.map((emp) => {
                const { grossEarnings, deductionsTotal, netPayable } = getPayrollDetails(emp);
                return (
                  <div
                    key={emp.id}
                    className="p-4 bg-stone-50 rounded-2xl border border-stone-200 flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <strong className="text-stone-900 font-black text-sm block">{emp.name}</strong>
                      <span className="text-[10px] text-amber-800 font-bold">{emp.id} • {emp.role}</span>
                      <div className="text-[11px] font-bold text-stone-700 mt-1">
                        Gross: ₹{grossEarnings.toLocaleString()} • Net: <span className="text-emerald-800 font-black">₹{netPayable.toLocaleString()}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setSelectedPayslipEmp(emp);
                        setIsPayslipModalOpen(true);
                      }}
                      className="bg-amber-900 hover:bg-amber-800 text-white font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all shrink-0"
                    >
                      <Printer className="w-3.5 h-3.5 text-amber-300" />
                      <span>Generate Payslip</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: ADD NEW STAFF EMPLOYEE */}
      {/* ========================================================= */}
      {isAddEmployeeOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-2xl border border-stone-200 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div>
                <h3 className="text-lg font-black text-stone-900">Add Staff Profile & Payroll Setup</h3>
                <p className="text-xs text-stone-500">Register employee details and bank credentials</p>
              </div>
              <button onClick={() => setIsAddEmployeeOpen(false)} className="p-2 hover:bg-stone-100 rounded-full text-stone-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateEmployee} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Employee Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh Varma"
                    value={newEmp.name}
                    onChange={(e) => setNewEmp({ ...newEmp, name: e.target.value })}
                    className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Role / Designation *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Line Chef / Commis"
                    value={newEmp.role}
                    onChange={(e) => setNewEmp({ ...newEmp, role: e.target.value })}
                    className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Department</label>
                  <select
                    value={newEmp.department}
                    onChange={(e) => setNewEmp({ ...newEmp, department: e.target.value as any })}
                    className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 font-bold"
                  >
                    <option value="Kerala Mess & Hostel Ops">🍛 Kerala Mess & Hostel Ops</option>
                    <option value="Kitchen & Culinary">Kitchen & Culinary</option>
                    <option value="Clinical Nutrition">Clinical Nutrition</option>
                    <option value="Procurement & Inventory">Procurement & Inventory</option>
                    <option value="Logistics & Delivery">Logistics & Delivery</option>
                    <option value="Administration">Administration</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    placeholder="ramesh@proteinbowl.in"
                    value={newEmp.email}
                    onChange={(e) => setNewEmp({ ...newEmp, email: e.target.value })}
                    className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Phone Number</label>
                  <input
                    type="text"
                    placeholder="+91 98000 12345"
                    value={newEmp.phone}
                    onChange={(e) => setNewEmp({ ...newEmp, phone: e.target.value })}
                    className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Date of Joining</label>
                  <input
                    type="date"
                    value={newEmp.dateOfJoining}
                    onChange={(e) => setNewEmp({ ...newEmp, dateOfJoining: e.target.value })}
                    className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 font-bold"
                  />
                </div>
              </div>

              {/* Bank Details */}
              <div className="p-3.5 bg-amber-50/80 rounded-2xl border border-amber-200 space-y-2">
                <h4 className="font-extrabold text-amber-950 uppercase text-[10px] tracking-wider">Bank Details for Direct Disbursal</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Bank Name & Branch"
                    value={newEmp.bankName}
                    onChange={(e) => setNewEmp({ ...newEmp, bankName: e.target.value })}
                    className="p-2 bg-white border border-amber-300 rounded-xl outline-none font-bold text-xs"
                  />
                  <input
                    type="text"
                    placeholder="Account Number"
                    value={newEmp.accountNumber}
                    onChange={(e) => setNewEmp({ ...newEmp, accountNumber: e.target.value })}
                    className="p-2 bg-white border border-amber-300 rounded-xl outline-none font-bold text-xs"
                  />
                  <input
                    type="text"
                    placeholder="IFSC Code"
                    value={newEmp.ifscCode}
                    onChange={(e) => setNewEmp({ ...newEmp, ifscCode: e.target.value })}
                    className="p-2 bg-white border border-amber-300 rounded-xl outline-none font-bold text-xs"
                  />
                  <input
                    type="text"
                    placeholder="PAN Card Number"
                    value={newEmp.panNumber}
                    onChange={(e) => setNewEmp({ ...newEmp, panNumber: e.target.value })}
                    className="p-2 bg-white border border-amber-300 rounded-xl outline-none font-bold text-xs"
                  />
                </div>
              </div>

              {/* Base Salary & Deductions */}
              <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200 space-y-2">
                <h4 className="font-extrabold text-stone-900 uppercase text-[10px] tracking-wider">Payroll Setup (Monthly Base)</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-stone-500">Base Salary (₹)</label>
                    <input
                      type="number"
                      value={newEmp.baseSalary}
                      onChange={(e) => setNewEmp({ ...newEmp, baseSalary: e.target.value })}
                      className="w-full p-2 bg-white border border-stone-300 rounded-xl font-extrabold text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-stone-500">Travel Allow. (₹)</label>
                    <input
                      type="number"
                      value={newEmp.travelAllowance}
                      onChange={(e) => setNewEmp({ ...newEmp, travelAllowance: e.target.value })}
                      className="w-full p-2 bg-white border border-stone-300 rounded-xl font-extrabold text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-stone-500">PF Deduct (₹)</label>
                    <input
                      type="number"
                      value={newEmp.pfDeduction}
                      onChange={(e) => setNewEmp({ ...newEmp, pfDeduction: e.target.value })}
                      className="w-full p-2 bg-white border border-stone-300 rounded-xl font-extrabold text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-stone-500">ESI Deduct (₹)</label>
                    <input
                      type="number"
                      value={newEmp.esiDeduction}
                      onChange={(e) => setNewEmp({ ...newEmp, esiDeduction: e.target.value })}
                      className="w-full p-2 bg-white border border-stone-300 rounded-xl font-extrabold text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddEmployeeOpen(false)}
                  className="px-4 py-2 bg-stone-100 font-bold rounded-xl text-stone-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-900 text-white font-black rounded-xl hover:bg-amber-800 transition-all shadow-sm"
                >
                  Save Staff Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: EDIT PAYROLL MATRIX */}
      {/* ========================================================= */}
      {editingPayrollEmp && (
        <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-stone-200">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div>
                <h3 className="text-base font-black text-stone-900">Edit Payroll for {editingPayrollEmp.name}</h3>
                <p className="text-xs text-stone-500">{editingPayrollEmp.id} • {editingPayrollEmp.role}</p>
              </div>
              <button onClick={() => setEditingPayrollEmp(null)} className="p-1.5 hover:bg-stone-100 rounded-full">
                <X className="w-5 h-5 text-stone-500" />
              </button>
            </div>

            <form onSubmit={handleUpdatePayroll} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Base Monthly Salary (₹)</label>
                  <input
                    type="number"
                    value={editingPayrollEmp.payrollSetup.baseSalary}
                    onChange={(e) => setEditingPayrollEmp({
                      ...editingPayrollEmp,
                      payrollSetup: { ...editingPayrollEmp.payrollSetup, baseSalary: Number(e.target.value) }
                    })}
                    className="w-full p-2 bg-stone-50 border border-stone-300 rounded-xl font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Travel Allowance (₹)</label>
                  <input
                    type="number"
                    value={editingPayrollEmp.payrollSetup.travelAllowance}
                    onChange={(e) => setEditingPayrollEmp({
                      ...editingPayrollEmp,
                      payrollSetup: { ...editingPayrollEmp.payrollSetup, travelAllowance: Number(e.target.value) }
                    })}
                    className="w-full p-2 bg-stone-50 border border-stone-300 rounded-xl font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Medical Allowance (₹)</label>
                  <input
                    type="number"
                    value={editingPayrollEmp.payrollSetup.medicalAllowance}
                    onChange={(e) => setEditingPayrollEmp({
                      ...editingPayrollEmp,
                      payrollSetup: { ...editingPayrollEmp.payrollSetup, medicalAllowance: Number(e.target.value) }
                    })}
                    className="w-full p-2 bg-stone-50 border border-stone-300 rounded-xl font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Phone/Internet Allow. (₹)</label>
                  <input
                    type="number"
                    value={editingPayrollEmp.payrollSetup.phoneAllowance}
                    onChange={(e) => setEditingPayrollEmp({
                      ...editingPayrollEmp,
                      payrollSetup: { ...editingPayrollEmp.payrollSetup, phoneAllowance: Number(e.target.value) }
                    })}
                    className="w-full p-2 bg-stone-50 border border-stone-300 rounded-xl font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Provident Fund PF (₹)</label>
                  <input
                    type="number"
                    value={editingPayrollEmp.payrollSetup.pfDeduction}
                    onChange={(e) => setEditingPayrollEmp({
                      ...editingPayrollEmp,
                      payrollSetup: { ...editingPayrollEmp.payrollSetup, pfDeduction: Number(e.target.value) }
                    })}
                    className="w-full p-2 bg-stone-50 border border-stone-300 rounded-xl font-bold text-rose-700"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">TDS Income Tax (₹)</label>
                  <input
                    type="number"
                    value={editingPayrollEmp.payrollSetup.tdsDeduction}
                    onChange={(e) => setEditingPayrollEmp({
                      ...editingPayrollEmp,
                      payrollSetup: { ...editingPayrollEmp.payrollSetup, tdsDeduction: Number(e.target.value) }
                    })}
                    className="w-full p-2 bg-stone-50 border border-stone-300 rounded-xl font-bold text-rose-700"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingPayrollEmp(null)}
                  className="px-4 py-2 bg-stone-100 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-900 text-white font-black rounded-xl hover:bg-amber-800"
                >
                  Update Salary Structure
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: PRINTABLE OFFICIAL PDF PAYSLIP */}
      {/* ========================================================= */}
      {isPayslipModalOpen && selectedPayslipEmp && (
        <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] overflow-y-auto p-8 space-y-6 shadow-2xl border border-stone-300 animate-fadeIn print:m-0 print:p-6 print:shadow-none">
            {/* Action Bar (hidden in print) */}
            <div className="flex items-center justify-between border-b border-stone-200 pb-4 print:hidden">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-amber-800" />
                <h3 className="font-extrabold text-stone-900 text-sm">Official Employee Payslip Viewer</h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrintPayslip}
                  className="px-4 py-2 bg-emerald-800 hover:bg-emerald-700 text-white font-black text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-xs"
                >
                  <Printer className="w-4 h-4" /> Print / Save PDF
                </button>
                <button onClick={() => setIsPayslipModalOpen(false)} className="p-2 hover:bg-stone-100 rounded-full">
                  <X className="w-5 h-5 text-stone-500" />
                </button>
              </div>
            </div>

            {/* PAYSLIP FORMAL DOCUMENT TEMPLATE */}
            <div className="border-2 border-stone-800 rounded-2xl p-6 space-y-6 bg-white text-stone-900 font-sans">
              {/* Company Letterhead */}
              <div className="flex justify-between items-start border-b-2 border-stone-800 pb-4">
                <div>
                  <h1 className="text-xl font-black tracking-tight text-emerald-950 uppercase">
                    ProteinBites Cloud Kitchens India Pvt. Ltd.
                  </h1>
                  <p className="text-[11px] text-stone-600 font-medium">
                    MD HRM Portal • Kitchen Lic. No: 11324007000182
                  </p>
                  <p className="text-[10px] text-stone-500">
                    Infopark Phase 2 Road, Kakkanad, Kochi, Kerala - 682030
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-xs font-black uppercase text-amber-900 bg-amber-100 px-3 py-1 rounded-md border border-amber-300 block">
                    PAYSLIP • {payslipMonth}
                  </span>
                  <span className="text-[10px] text-stone-500 mt-1 block">Generated: {new Date().toISOString().split('T')[0]}</span>
                </div>
              </div>

              {/* Employee Summary Grid */}
              <div className="grid grid-cols-2 gap-4 text-xs bg-stone-50 p-4 rounded-xl border border-stone-300">
                <div>
                  <div className="mb-1"><span className="text-stone-500">Employee ID:</span> <strong className="text-stone-900 font-black">{selectedPayslipEmp.id}</strong></div>
                  <div className="mb-1"><span className="text-stone-500">Employee Name:</span> <strong className="text-stone-900 font-black">{selectedPayslipEmp.name}</strong></div>
                  <div><span className="text-stone-500">Designation:</span> <strong>{selectedPayslipEmp.role}</strong></div>
                </div>

                <div>
                  <div className="mb-1"><span className="text-stone-500">Department:</span> <strong>{selectedPayslipEmp.department}</strong></div>
                  <div className="mb-1"><span className="text-stone-500">Bank Name:</span> <strong>{selectedPayslipEmp.bankDetails.bankName}</strong></div>
                  <div><span className="text-stone-500">A/C No:</span> <strong>{selectedPayslipEmp.bankDetails.accountNumber}</strong> • IFSC: {selectedPayslipEmp.bankDetails.ifscCode}</div>
                </div>
              </div>

              {/* Itemized Earnings & Deductions Table */}
              {(() => {
                const p = selectedPayslipEmp.payrollSetup;
                const { allowancesTotal, grossEarnings, deductionsTotal, netPayable } = getPayrollDetails(selectedPayslipEmp);

                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-0 border border-stone-800 rounded-xl overflow-hidden text-xs">
                      {/* Left: Earnings */}
                      <div className="border-r border-stone-800">
                        <div className="bg-stone-200 p-2 font-black uppercase tracking-wider text-[11px] border-b border-stone-800">
                          Earnings Breakdown
                        </div>
                        <div className="p-3 space-y-1.5 divide-y divide-stone-200">
                          <div className="flex justify-between pt-1"><span>Basic Salary</span><strong>₹{p.baseSalary.toLocaleString()}</strong></div>
                          <div className="flex justify-between pt-1"><span>Travel Allowance</span><strong>₹{p.travelAllowance.toLocaleString()}</strong></div>
                          <div className="flex justify-between pt-1"><span>Medical Allowance</span><strong>₹{p.medicalAllowance.toLocaleString()}</strong></div>
                          <div className="flex justify-between pt-1"><span>Phone / Internet Allowance</span><strong>₹{p.phoneAllowance.toLocaleString()}</strong></div>
                          {p.specialBonus > 0 && <div className="flex justify-between pt-1"><span>Performance Bonus</span><strong>₹{p.specialBonus.toLocaleString()}</strong></div>}
                          <div className="flex justify-between pt-2 border-t-2 border-stone-800 font-black text-emerald-950">
                            <span>TOTAL GROSS EARNINGS</span>
                            <span>₹{grossEarnings.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Deductions */}
                      <div>
                        <div className="bg-stone-200 p-2 font-black uppercase tracking-wider text-[11px] border-b border-stone-800">
                          Statutory Deductions
                        </div>
                        <div className="p-3 space-y-1.5 divide-y divide-stone-200">
                          <div className="flex justify-between pt-1"><span>Provident Fund (PF)</span><strong>₹{p.pfDeduction.toLocaleString()}</strong></div>
                          <div className="flex justify-between pt-1"><span>ESI Health Insurance</span><strong>₹{p.esiDeduction.toLocaleString()}</strong></div>
                          <div className="flex justify-between pt-1"><span>Professional Tax (PT)</span><strong>₹{p.ptDeduction.toLocaleString()}</strong></div>
                          <div className="flex justify-between pt-1"><span>TDS Income Tax</span><strong>₹{p.tdsDeduction.toLocaleString()}</strong></div>
                          <div className="flex justify-between pt-2 border-t-2 border-stone-800 font-black text-rose-900">
                            <span>TOTAL DEDUCTIONS</span>
                            <span>₹{deductionsTotal.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* NET PAYABLE BOX */}
                    <div className="bg-emerald-950 text-white p-4 rounded-xl flex items-center justify-between border-2 border-emerald-800">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 block">
                          NET AMOUNT REMITTED TO BANK
                        </span>
                        <span className="text-2xl font-black text-white">
                          ₹{netPayable.toLocaleString()}
                        </span>
                      </div>
                      <div className="text-right text-[11px] text-emerald-200 font-bold">
                        Direct Bank Disbursal Confirmed
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Signatures Footer */}
              <div className="pt-8 flex justify-between items-end text-xs text-stone-600 border-t border-stone-300">
                <div>
                  <p className="font-bold">Employee Signature</p>
                  <div className="h-8"></div>
                  <p className="text-[10px] text-stone-400">Date: __________________</p>
                </div>

                <div className="text-right">
                  <div className="inline-block border-b-2 border-stone-800 pb-1 mb-1 font-black text-stone-900">
                    ProteinBites Cloud Kitchens MD
                  </div>
                  <p className="font-bold text-stone-800">Authorized Signatory</p>
                  <p className="text-[10px] text-stone-400">Computer Generated Document</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SUB-TAB 5: RESIGNATION & TERMINATION PROTOCOL */}
      {/* ========================================================= */}
      {hrmTab === 'resignation' && (
        <div className="space-y-6">
          {/* Executive Overview Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs space-y-1">
              <span className="text-[10px] font-bold uppercase text-stone-500 block">Active Notice Period</span>
              <strong className="text-2xl font-black text-amber-900">
                {separations.filter((s) => s.status === 'Notice Period Active' || s.status === 'Clearance In Progress').length} Staff
              </strong>
              <span className="text-[10px] text-stone-500 block">Ongoing Exit Pipeline</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs space-y-1">
              <span className="text-[10px] font-bold uppercase text-stone-500 block">Clearances Pending (NOC)</span>
              <strong className="text-2xl font-black text-rose-700">
                {separations.filter((s) => Object.values(s.clearanceChecklist).some((v) => !v)).length} Staff
              </strong>
              <span className="text-[10px] text-rose-800 font-bold block">Assets / Accounts Dues</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs space-y-1">
              <span className="text-[10px] font-bold uppercase text-stone-500 block">FNF Settlements Pending</span>
              <strong className="text-2xl font-black text-emerald-800">
                ₹{separations
                  .filter((s) => s.fnfSettlement.paymentStatus === 'Pending')
                  .reduce((sum, s) => sum + s.fnfSettlement.netFnfAmount, 0)
                  .toLocaleString()}
              </strong>
              <span className="text-[10px] text-stone-500 block">Full & Final Liability</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs space-y-1">
              <span className="text-[10px] font-bold uppercase text-stone-500 block">Completed Separations</span>
              <strong className="text-2xl font-black text-stone-900">
                {separations.filter((s) => s.status === 'Exit Completed').length} Completed
              </strong>
              <span className="text-[10px] text-emerald-700 font-bold block">Relieving Certificates Issued</span>
            </div>
          </div>

          {/* Action Header & Triggers */}
          <div className="bg-white p-5 rounded-3xl border border-stone-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-black text-stone-900 uppercase tracking-wider flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-700" />
                <span>Executive Offboarding & Separation Protocol</span>
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                Manage Employee Resignations, Issue MD Termination Orders, Audit Departmental NOCs & Process FNF Remittances.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setSeparationForm({ ...separationForm, type: 'Resignation' });
                  setIsInitiateSeparationOpen(true);
                }}
                className="px-4 py-2.5 bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold text-xs rounded-xl border border-amber-300 flex items-center gap-2 transition-all shadow-xs"
              >
                <FileText className="w-4 h-4 text-amber-900" />
                <span>Log Resignation Request</span>
              </button>

              <button
                onClick={() => {
                  setSeparationForm({ ...separationForm, type: 'Termination', noticePeriodDays: 15 });
                  setIsInitiateSeparationOpen(true);
                }}
                className="px-4 py-2.5 bg-rose-900 hover:bg-rose-800 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-2 transition-all"
              >
                <UserX className="w-4 h-4 text-rose-300" />
                <span>Issue Termination Order</span>
              </button>
            </div>
          </div>

          {/* Separations & Offboarding Protocol List */}
          <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-sm">
            <div className="p-4 bg-stone-900 text-white flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider flex items-center gap-2 text-amber-400">
                <Users className="w-4 h-4" />
                <span>Active Separation & Exit Pipeline ({separations.length})</span>
              </span>
              <span className="text-[10px] bg-stone-800 text-stone-300 px-3 py-1 rounded-full font-mono">
                MD Direct Compliance Record
              </span>
            </div>

            <div className="divide-y divide-stone-200">
              {separations.map((sep) => {
                const isExitDone = sep.status === 'Exit Completed';
                const nocCompletedCount = Object.values(sep.clearanceChecklist).filter(Boolean).length;
                const nocTotal = 4;

                return (
                  <div key={sep.id} className="p-5 space-y-4 hover:bg-stone-50/80 transition-all">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* Left: Employee Info */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            sep.type === 'Termination' 
                              ? 'bg-rose-100 text-rose-900 border border-rose-300' 
                              : sep.type === 'Resignation'
                              ? 'bg-amber-100 text-amber-950 border border-amber-300'
                              : 'bg-blue-100 text-blue-900 border border-blue-300'
                          }`}>
                            {sep.type}
                          </span>
                          <span className="text-xs font-bold text-stone-400 font-mono">{sep.id}</span>
                          <span className="text-xs font-bold text-stone-900">• {sep.employeeId}</span>
                        </div>
                        <h4 className="text-base font-black text-stone-900">{sep.employeeName}</h4>
                        <p className="text-xs text-stone-600 font-medium">
                          {sep.role} ({sep.department})
                        </p>
                      </div>

                      {/* Middle: Dates & Status */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs bg-stone-50 p-3 rounded-2xl border border-stone-200">
                        <div>
                          <span className="text-[10px] text-stone-400 block font-bold">Initiated On:</span>
                          <strong className="text-stone-900 font-mono">{sep.initiationDate}</strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-stone-400 block font-bold">Notice Period:</span>
                          <strong className="text-amber-900">{sep.noticePeriodDays} Days</strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-stone-400 block font-bold">Last Working Day:</span>
                          <strong className="text-rose-900 font-black">{sep.lastWorkingDay}</strong>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => setSelectedNocRecord(sep)}
                          className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs rounded-xl border border-stone-300 flex items-center gap-1.5"
                        >
                          <FileCheck className="w-3.5 h-3.5 text-emerald-700" />
                          <span>Clearance NOC ({nocCompletedCount}/{nocTotal})</span>
                        </button>

                        <button
                          onClick={() => setSelectedFnfRecord(sep)}
                          className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs rounded-xl border border-stone-300 flex items-center gap-1.5"
                        >
                          <Receipt className="w-3.5 h-3.5 text-amber-700" />
                          <span>FNF Settlement</span>
                        </button>

                        <button
                          onClick={() => setSelectedCertRecord(sep)}
                          className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-emerald-950 font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5"
                        >
                          <Award className="w-3.5 h-3.5" />
                          <span>Relieving Certificate</span>
                        </button>

                        {!isExitDone && (
                          <button
                            onClick={() => handleFinalizeExit(sep)}
                            className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white font-black text-xs rounded-xl shadow-xs flex items-center gap-1"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Complete Exit</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Additional Details Line */}
                    <div className="text-xs bg-stone-50/60 p-2.5 rounded-xl border border-stone-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-stone-700">
                      <div>
                        <strong className="font-bold text-stone-900">Reason:</strong> {sep.reason}
                      </div>
                      <div className="flex items-center gap-3 shrink-0 text-[11px]">
                        <span>
                          FNF Net: <strong className="text-emerald-900 font-black">₹{sep.fnfSettlement.netFnfAmount.toLocaleString()}</strong>
                        </span>
                        <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                          sep.fnfSettlement.paymentStatus === 'Settled'
                            ? 'bg-emerald-100 text-emerald-900'
                            : 'bg-amber-100 text-amber-900'
                        }`}>
                          FNF: {sep.fnfSettlement.paymentStatus}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SUB-TAB 6: ISSUE APPOINTMENT LETTER */}
      {/* ========================================================= */}
      {hrmTab === 'appointment' && (
        <div className="space-y-6">
          {/* Executive Overview Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs space-y-1">
              <span className="text-[10px] font-bold uppercase text-stone-500 block">Total Letters Issued</span>
              <strong className="text-2xl font-black text-amber-900">{appointmentLetters.length} Letters</strong>
              <span className="text-[10px] text-stone-500 block">Candidate Offer Pipeline</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs space-y-1">
              <span className="text-[10px] font-bold uppercase text-stone-500 block">Accepted Offers</span>
              <strong className="text-2xl font-black text-emerald-800">
                {appointmentLetters.filter((l) => l.status === 'Accepted' || l.status === 'Signed Copy Uploaded').length} Accepted
              </strong>
              <span className="text-[10px] text-emerald-700 font-bold block">100% Joining Compliance</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs space-y-1">
              <span className="text-[10px] font-bold uppercase text-stone-500 block">Pending Acceptance</span>
              <strong className="text-2xl font-black text-amber-950">
                {appointmentLetters.filter((l) => l.status === 'Issued').length} Letters
              </strong>
              <span className="text-[10px] text-amber-800 font-bold block">Validity Active</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs space-y-1">
              <span className="text-[10px] font-bold uppercase text-stone-500 block">Avg Offered Annual CTC</span>
              <strong className="text-2xl font-black text-amber-950">
                ₹{appointmentLetters.length > 0 ? (appointmentLetters.reduce((sum, l) => sum + l.annualCtc, 0) / appointmentLetters.length / 100000).toFixed(1) : 0} LPA
              </strong>
              <span className="text-[10px] text-stone-500 block">Competitive Market Compensation</span>
            </div>
          </div>

          {/* Action Bar & Filter */}
          <div className="bg-white p-4 rounded-2xl border border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search candidate name, role, email..."
                value={letterSearchQuery}
                onChange={(e) => setLetterSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-stone-50 border border-stone-300 rounded-xl font-bold outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <select
                value={letterStatusFilter}
                onChange={(e) => setLetterStatusFilter(e.target.value)}
                className="p-2 bg-stone-50 border border-stone-300 rounded-xl font-bold text-xs outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="All">All Statuses</option>
                <option value="Issued">Issued</option>
                <option value="Accepted">Accepted</option>
                <option value="Draft">Draft</option>
              </select>

              <button
                onClick={() => setIsIssueLetterModalOpen(true)}
                className="bg-amber-900 hover:bg-amber-800 text-white font-black px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition-all shadow-sm shrink-0"
              >
                <Plus className="w-4 h-4 text-amber-300" />
                <span>Issue New Appointment Letter</span>
              </button>
            </div>
          </div>

          {/* Appointment Letters Register List */}
          <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-sm">
            <div className="p-4 bg-stone-900 text-white flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider flex items-center gap-2 text-amber-400">
                <FileCheck className="w-4 h-4" />
                <span>Issued Appointment Letters Register ({appointmentLetters.length})</span>
              </span>
              <span className="text-[10px] bg-stone-800 text-amber-300 px-3 py-1 rounded-full font-mono">
                Official Company Letterhead Format
              </span>
            </div>

            <div className="divide-y divide-stone-200">
              {appointmentLetters
                .filter((letter) => {
                  const matchSearch =
                    letter.candidateName.toLowerCase().includes(letterSearchQuery.toLowerCase()) ||
                    letter.designation.toLowerCase().includes(letterSearchQuery.toLowerCase()) ||
                    letter.candidateEmail.toLowerCase().includes(letterSearchQuery.toLowerCase());
                  const matchStatus = letterStatusFilter === 'All' || letter.status === letterStatusFilter;
                  return matchSearch && matchStatus;
                })
                .map((letter) => (
                  <div key={letter.id} className="p-5 space-y-3 hover:bg-stone-50/80 transition-all">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* Candidate info */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black bg-amber-100 text-amber-950 border border-amber-300">
                            Ref: {letter.referenceNumber}
                          </span>
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            letter.status === 'Accepted'
                              ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                              : 'bg-amber-100 text-amber-900 border border-amber-300'
                          }`}>
                            {letter.status}
                          </span>
                        </div>
                        <h4 className="text-base font-black text-stone-900">{letter.candidateName}</h4>
                        <p className="text-xs text-amber-800 font-bold">
                          {letter.designation} • {letter.department}
                        </p>
                        <p className="text-[11px] text-stone-500">
                          {letter.candidateEmail} • {letter.candidatePhone}
                        </p>
                      </div>

                      {/* Salary & Offer details */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-stone-50 p-3.5 rounded-2xl border border-stone-200">
                        <div>
                          <span className="text-[10px] text-stone-400 block font-bold uppercase">Date of Joining</span>
                          <strong className="text-stone-900 font-mono">{letter.joiningDate}</strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-stone-400 block font-bold uppercase">Employment Type</span>
                          <strong className="text-stone-800">{letter.employmentType}</strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-stone-400 block font-bold uppercase">Annual CTC</span>
                          <strong className="text-stone-900 font-black">₹{letter.annualCtc.toLocaleString()} / yr</strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-stone-400 block font-bold uppercase">Monthly Net Pay</span>
                          <strong className="text-emerald-800 font-black">₹{letter.monthlyNetSalary.toLocaleString()} / mo</strong>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          onClick={() => setSelectedAppointmentLetter(letter)}
                          className="px-4 py-2 bg-amber-900 hover:bg-amber-800 text-white font-black text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition-all"
                        >
                          <Printer className="w-4 h-4 text-amber-300" />
                          <span>View & Print Letterhead</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: INITIATE RESIGNATION / TERMINATION ORDER */}
      {isInitiateSeparationOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-stone-200 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-600" />
                <h3 className="text-base font-black text-stone-900">
                  {separationForm.type === 'Termination' ? 'Issue Executive Termination Order' : 'Log Employee Resignation Notice'}
                </h3>
              </div>
              <button onClick={() => setIsInitiateSeparationOpen(false)} className="p-1.5 hover:bg-stone-100 rounded-full">
                <X className="w-5 h-5 text-stone-500" />
              </button>
            </div>

            <form onSubmit={handleInitiateSeparationSubmit} className="space-y-4 text-xs font-bold">
              <div>
                <label className="text-stone-600 block mb-1">Select Employee</label>
                <select
                  value={separationForm.employeeId}
                  onChange={(e) => setSeparationForm({ ...separationForm, employeeId: e.target.value })}
                  className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl outline-none"
                >
                  {staffList.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.id} - {emp.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-stone-600 block mb-1">Separation Type</label>
                  <select
                    value={separationForm.type}
                    onChange={(e) => setSeparationForm({ ...separationForm, type: e.target.value as any })}
                    className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl outline-none"
                  >
                    <option value="Resignation">Resignation</option>
                    <option value="Termination">Termination (MD Order)</option>
                    <option value="Mutual Separation">Mutual Separation</option>
                  </select>
                </div>

                <div>
                  <label className="text-stone-600 block mb-1">Notice Period (Days)</label>
                  <input
                    type="number"
                    value={separationForm.noticePeriodDays}
                    onChange={(e) => setSeparationForm({ ...separationForm, noticePeriodDays: Number(e.target.value) })}
                    className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-stone-600 block mb-1">Reason / Official Remarks</label>
                <textarea
                  rows={3}
                  value={separationForm.reason}
                  onChange={(e) => setSeparationForm({ ...separationForm, reason: e.target.value })}
                  placeholder="Enter cause of resignation or termination grounds..."
                  className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl outline-none font-medium"
                />
              </div>

              <div className="flex items-center gap-2 bg-amber-50 p-3 rounded-xl border border-amber-200">
                <input
                  type="checkbox"
                  id="revokeIt"
                  checked={separationForm.revokeItImmediately}
                  onChange={(e) => setSeparationForm({ ...separationForm, revokeItImmediately: e.target.checked })}
                  className="rounded text-amber-600 focus:ring-amber-500"
                />
                <label htmlFor="revokeIt" className="text-stone-800 text-[11px] font-bold">
                  Immediately revoke IT & ERP Cloud Credentials upon order issuance
                </label>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsInitiateSeparationOpen(false)}
                  className="px-4 py-2 bg-stone-100 text-stone-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2 font-black text-white rounded-xl shadow-md ${
                    separationForm.type === 'Termination' ? 'bg-rose-800 hover:bg-rose-700' : 'bg-amber-900 hover:bg-amber-800'
                  }`}
                >
                  Confirm & Execute Protocol
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: DEPARTMENTAL EXIT CLEARANCE (NOC) CHECKLIST */}
      {selectedNocRecord && (
        <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-stone-200 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div>
                <h3 className="text-base font-black text-stone-900">Departmental Exit Clearance (NOC)</h3>
                <p className="text-xs text-amber-800 font-bold">{selectedNocRecord.employeeName} ({selectedNocRecord.employeeId})</p>
              </div>
              <button onClick={() => setSelectedNocRecord(null)} className="p-1.5 hover:bg-stone-100 rounded-full">
                <X className="w-5 h-5 text-stone-500" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-stone-600 font-medium">
                Verify asset handover and absence of financial or operational liabilities across all departments:
              </p>

              <div className="space-y-2">
                {[
                  { key: 'kitchenAssetsHandover', title: '1. Kitchen & Culinary Asset Handover', desc: 'Aprons, knives, uniform, locker keys and kitchen equipment.' },
                  { key: 'idBadgeAndKeys', title: '2. ID Badge, Smart Keys & Premises Access', desc: 'Facility access cards, master keys and staff parking pass.' },
                  { key: 'accountsNoDues', title: '3. Finance & Accounts Clearance', desc: 'Petty cash settlement, pending travel claims and advance repayments.' },
                  { key: 'itAccessRevoked', title: '4. IT Credentials & ERP Deactivation', desc: 'Company email account, cloud kitchen portal & POS terminal access.' }
                ].map((item) => {
                  const isChecked = selectedNocRecord.clearanceChecklist[item.key as keyof SeparationRecord['clearanceChecklist']];
                  return (
                    <div
                      key={item.key}
                      onClick={() => handleToggleNocCheck(selectedNocRecord.id, item.key as any)}
                      className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-start gap-3 ${
                        isChecked ? 'bg-emerald-50 border-emerald-300' : 'bg-stone-50 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      <button type="button" className="mt-0.5">
                        {isChecked ? (
                          <CheckSquare className="w-5 h-5 text-emerald-700" />
                        ) : (
                          <Square className="w-5 h-5 text-stone-400" />
                        )}
                      </button>
                      <div>
                        <strong className="text-stone-900 font-bold block">{item.title}</strong>
                        <span className="text-stone-500 text-[11px] font-medium">{item.desc}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedNocRecord(null)}
                className="px-5 py-2 bg-stone-900 text-white font-black rounded-xl text-xs"
              >
                Save Clearance Status
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: FULL & FINAL (FNF) SETTLEMENT AUDIT */}
      {selectedFnfRecord && (
        <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-stone-200 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div>
                <h3 className="text-base font-black text-stone-900">Full & Final (FNF) Settlement</h3>
                <p className="text-xs text-amber-800 font-bold">{selectedFnfRecord.employeeName} ({selectedFnfRecord.employeeId})</p>
              </div>
              <button onClick={() => setSelectedFnfRecord(null)} className="p-1.5 hover:bg-stone-100 rounded-full">
                <X className="w-5 h-5 text-stone-500" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 space-y-2">
                <div className="flex justify-between items-center border-b border-stone-200 pb-2">
                  <span className="text-stone-600 font-bold">Unpaid Salary Days ({selectedFnfRecord.fnfSettlement.unpaidSalaryDays} Days)</span>
                  <strong className="text-stone-900 font-black">₹{selectedFnfRecord.fnfSettlement.unpaidSalaryAmount.toLocaleString()}</strong>
                </div>

                <div className="flex justify-between items-center border-b border-stone-200 pb-2">
                  <span className="text-stone-600 font-bold">Earned Leave Encashment ({selectedFnfRecord.fnfSettlement.leaveEncashmentDays} Days)</span>
                  <strong className="text-stone-900 font-black">₹{selectedFnfRecord.fnfSettlement.leaveEncashmentAmount.toLocaleString()}</strong>
                </div>

                <div className="flex justify-between items-center pt-1 font-black text-sm text-emerald-950">
                  <span>NET FULL & FINAL PAYABLE</span>
                  <span className="text-base text-emerald-700">₹{selectedFnfRecord.fnfSettlement.netFnfAmount.toLocaleString()}</span>
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-amber-900 block">Payment Status</span>
                  <strong className="text-amber-950">{selectedFnfRecord.fnfSettlement.paymentStatus}</strong>
                </div>
                {selectedFnfRecord.fnfSettlement.paymentStatus === 'Pending' ? (
                  <button
                    onClick={() => handleMarkFnfSettled(selectedFnfRecord.id)}
                    className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white font-black rounded-xl text-xs shadow-xs"
                  >
                    Mark FNF as Settled
                  </button>
                ) : (
                  <span className="text-emerald-800 font-black text-xs flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> Settled on {selectedFnfRecord.fnfSettlement.settledOn}
                  </span>
                )}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedFnfRecord(null)}
                className="px-4 py-2 bg-stone-100 text-stone-700 font-bold rounded-xl text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: RELIEVING & EXPERIENCE CERTIFICATE PREVIEW (PRINTABLE) */}
      {selectedCertRecord && (
        <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-8 space-y-6 shadow-2xl border border-stone-200 animate-fadeIn max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <span className="text-xs font-black uppercase text-amber-900 bg-amber-100 px-3 py-1 rounded-full">
                Official Relieving & Experience Certificate
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Certificate</span>
                </button>
                <button onClick={() => setSelectedCertRecord(null)} className="p-1.5 hover:bg-stone-100 rounded-full">
                  <X className="w-5 h-5 text-stone-500" />
                </button>
              </div>
            </div>

            {/* Official Letterhead Certificate Content */}
            <div className="border-2 border-stone-800 p-8 rounded-2xl space-y-6 text-stone-900 font-serif">
              <div className="flex justify-between items-start border-b-2 border-stone-800 pb-4 font-sans">
                <div>
                  <h2 className="text-2xl font-black tracking-tight text-emerald-950">PROTEINBITES CLOUD KITCHENS</h2>
                  <p className="text-xs text-stone-600">Premium Nutritional Food & Dietetic Subscriptions</p>
                  <p className="text-[10px] text-stone-500">Corporate HQ: MG Road, Ernakulam, Kochi, Kerala - 682016</p>
                </div>
                <div className="text-right text-xs">
                  <strong className="block text-amber-900 font-mono">Ref: PB/HR/REL/{selectedCertRecord.id}</strong>
                  <span className="text-stone-500 text-[11px]">Date: {new Date().toISOString().split('T')[0]}</span>
                </div>
              </div>

              <div className="text-center my-6">
                <h3 className="text-xl font-bold uppercase tracking-widest text-stone-900 underline decoration-amber-500 decoration-2 underline-offset-4">
                  TO WHOMSOEVER IT MAY CONCERN
                </h3>
              </div>

              <div className="space-y-4 text-sm leading-relaxed text-stone-800 font-sans">
                <p>
                  This is to certify that <strong>{selectedCertRecord.employeeName}</strong> (Employee ID: <strong>{selectedCertRecord.employeeId}</strong>) was employed with <strong>ProteinBites Cloud Kitchens</strong> in the position of <strong>{selectedCertRecord.role}</strong> under the <strong>{selectedCertRecord.department}</strong> department.
                </p>

                <p>
                  They were initiated into service and served through to their final working day on <strong>{selectedCertRecord.lastWorkingDay}</strong>. During their tenure, they performed their responsibilities with diligence, professional integrity, and commitment to culinary and operational excellence.
                </p>

                <p>
                  All departmental clearances (NOCs) and Full & Final (FNF) financial settlements have been duly audited and completed. They stand relieved from their duties effective from the close of business hours on <strong>{selectedCertRecord.lastWorkingDay}</strong>.
                </p>

                <p>
                  We wish <strong>{selectedCertRecord.employeeName}</strong> all success in their future professional endeavors.
                </p>
              </div>

              <div className="pt-12 flex justify-between items-end text-xs font-sans border-t border-stone-300">
                <div>
                  <p className="text-[10px] text-stone-400">Official Seal of ProteinBites</p>
                  <div className="w-24 h-16 border-2 border-dashed border-stone-300 rounded-xl flex items-center justify-center text-[10px] text-stone-400 mt-1">
                    [ KITCHEN SEAL ]
                  </div>
                </div>

                <div className="text-right">
                  <div className="border-b-2 border-stone-800 pb-1 mb-1 font-black text-stone-900">
                    Managing Director Signature
                  </div>
                  <p className="font-bold text-stone-800">Executive Managing Director</p>
                  <p className="text-[10px] text-stone-500">ProteinBites Cloud Kitchens Pvt. Ltd.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW STAFF PROFILE DETAIL MODAL */}
      {selectedEmp && (
        <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-stone-200">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div>
                <h3 className="text-base font-black text-stone-900">{selectedEmp.name}</h3>
                <p className="text-xs text-amber-800 font-bold">{selectedEmp.id} • {selectedEmp.role}</p>
              </div>
              <button onClick={() => setSelectedEmp(null)} className="p-1.5 hover:bg-stone-100 rounded-full">
                <X className="w-5 h-5 text-stone-500" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-stone-50 p-3 rounded-2xl">
                <div><span className="text-stone-400 block text-[10px]">Department:</span> <strong>{selectedEmp.department}</strong></div>
                <div><span className="text-stone-400 block text-[10px]">Date of Joining:</span> <strong>{selectedEmp.dateOfJoining}</strong></div>
                <div><span className="text-stone-400 block text-[10px]">Email:</span> <strong>{selectedEmp.email}</strong></div>
                <div><span className="text-stone-400 block text-[10px]">Phone:</span> <strong>{selectedEmp.phone}</strong></div>
              </div>

              <div className="bg-amber-50 p-3 rounded-2xl border border-amber-200 space-y-1">
                <span className="font-extrabold text-amber-950 uppercase text-[10px]">Bank Credentials</span>
                <div><strong>Bank Name:</strong> {selectedEmp.bankDetails.bankName}</div>
                <div><strong>A/C No:</strong> {selectedEmp.bankDetails.accountNumber}</div>
                <div><strong>IFSC Code:</strong> {selectedEmp.bankDetails.ifscCode}</div>
                <div><strong>PAN Card:</strong> {selectedEmp.bankDetails.panNumber}</div>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between gap-2">
              <button
                onClick={() => {
                  handleEmployeeLogin(selectedEmp);
                  setSelectedEmp(null);
                }}
                className={`px-4 py-2 font-black rounded-xl text-xs flex items-center gap-1.5 shadow-xs ${
                  selectedEmp.department === 'Kerala Mess & Hostel Ops'
                    ? 'bg-amber-900 hover:bg-amber-800 text-white'
                    : 'bg-emerald-800 hover:bg-emerald-700 text-white'
                }`}
              >
                <Key className="w-3.5 h-3.5 text-amber-300" />
                <span>Log in as {selectedEmp.name.split(' ')[0]}</span>
              </button>
              <button onClick={() => setSelectedEmp(null)} className="px-5 py-2 bg-stone-800 text-white font-black rounded-xl text-xs hover:bg-stone-700">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: ISSUE NEW APPOINTMENT LETTER FORM */}
      {isIssueLetterModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-2xl border border-stone-200 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div>
                <h3 className="text-lg font-black text-stone-900">Issue Official Appointment Letter</h3>
                <p className="text-xs text-stone-500">Draft candidate offer with compensation terms & company guidelines</p>
              </div>
              <button onClick={() => setIsIssueLetterModalOpen(false)} className="p-2 hover:bg-stone-100 rounded-full text-stone-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAppointmentLetter} className="space-y-4 text-xs">
              {/* Select Source */}
              <div className="p-3.5 bg-amber-50/80 rounded-2xl border border-amber-200 space-y-2">
                <label className="block font-extrabold text-amber-950 uppercase text-[10px] tracking-wider">Candidate Source / Recruiter Link</label>
                <select
                  value={letterForm.candidateSource}
                  onChange={(e) => handleCandidateSourceChange(e.target.value)}
                  className="w-full p-2.5 bg-white border border-amber-300 rounded-xl font-bold outline-none focus:ring-2 focus:ring-amber-500 text-xs"
                >
                  <option value="new">+ New Recruited Candidate (Custom)</option>
                  {staffList.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      Existing Staff: {emp.name} ({emp.id} - {emp.role})
                    </option>
                  ))}
                </select>
              </div>

              {/* Candidate Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Candidate Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dr. Ananya Sen"
                    value={letterForm.candidateName}
                    onChange={(e) => setLetterForm({ ...letterForm, candidateName: e.target.value })}
                    className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl font-bold outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    placeholder="ananya@proteinbowl.in"
                    value={letterForm.candidateEmail}
                    onChange={(e) => setLetterForm({ ...letterForm, candidateEmail: e.target.value })}
                    className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl font-bold outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Phone Number</label>
                  <input
                    type="text"
                    placeholder="+91 98470 55667"
                    value={letterForm.candidatePhone}
                    onChange={(e) => setLetterForm({ ...letterForm, candidatePhone: e.target.value })}
                    className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl font-bold outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Residential Address</label>
                  <input
                    type="text"
                    placeholder="Skyline Enclave, Kakkanad, Kochi"
                    value={letterForm.candidateAddress}
                    onChange={(e) => setLetterForm({ ...letterForm, candidateAddress: e.target.value })}
                    className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl font-bold outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Position & Location */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Designation / Role *</label>
                  <input
                    type="text"
                    required
                    placeholder="Clinical Nutritionist"
                    value={letterForm.designation}
                    onChange={(e) => setLetterForm({ ...letterForm, designation: e.target.value })}
                    className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl font-bold outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Department</label>
                  <select
                    value={letterForm.department}
                    onChange={(e) => setLetterForm({ ...letterForm, department: e.target.value as any })}
                    className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl font-bold outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="Clinical Nutrition">Clinical Nutrition</option>
                    <option value="Kitchen & Culinary">Kitchen & Culinary</option>
                    <option value="Procurement & Inventory">Procurement & Inventory</option>
                    <option value="Logistics & Delivery">Logistics & Delivery</option>
                    <option value="Administration">Administration</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Employment Type</label>
                  <select
                    value={letterForm.employmentType}
                    onChange={(e) => setLetterForm({ ...letterForm, employmentType: e.target.value as any })}
                    className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl font-bold outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="Full-time Probationary">Full-time Probationary</option>
                    <option value="Permanent Executive">Permanent Executive</option>
                    <option value="Consultant Contract">Consultant Contract</option>
                    <option value="Part-Time">Part-Time</option>
                  </select>
                </div>
              </div>

              {/* Salary Setup */}
              <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200 space-y-2">
                <h4 className="font-extrabold text-stone-900 uppercase text-[10px] tracking-wider">Financial Compensation Setup</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-stone-500">Monthly Base (₹)</label>
                    <input
                      type="number"
                      value={letterForm.monthlyBaseSalary}
                      onChange={(e) => setLetterForm({ ...letterForm, monthlyBaseSalary: Number(e.target.value) })}
                      className="w-full p-2 bg-white border border-stone-300 rounded-xl font-extrabold text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-stone-500">Allowances (₹)</label>
                    <input
                      type="number"
                      value={letterForm.monthlyAllowances}
                      onChange={(e) => setLetterForm({ ...letterForm, monthlyAllowances: Number(e.target.value) })}
                      className="w-full p-2 bg-white border border-stone-300 rounded-xl font-extrabold text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-stone-500">Est. Gross Pay</label>
                    <div className="p-2 bg-stone-100 border border-stone-300 rounded-xl font-black text-xs text-stone-900">
                      ₹{(Number(letterForm.monthlyBaseSalary) + Number(letterForm.monthlyAllowances)).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-stone-500">Est. Annual CTC</label>
                    <div className="p-2 bg-emerald-100 border border-emerald-300 rounded-xl font-black text-xs text-emerald-900">
                      ₹{((Number(letterForm.monthlyBaseSalary) + Number(letterForm.monthlyAllowances)) * 12).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Dates & Terms */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Target Date of Joining</label>
                  <input
                    type="date"
                    value={letterForm.joiningDate}
                    onChange={(e) => setLetterForm({ ...letterForm, joiningDate: e.target.value })}
                    className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl font-bold outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Probation Period (Months)</label>
                  <input
                    type="number"
                    value={letterForm.probationPeriodMonths}
                    onChange={(e) => setLetterForm({ ...letterForm, probationPeriodMonths: Number(e.target.value) })}
                    className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl font-bold outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Special Terms / Directives</label>
                <textarea
                  rows={2}
                  value={letterForm.specialTerms}
                  onChange={(e) => setLetterForm({ ...letterForm, specialTerms: e.target.value })}
                  className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl font-bold outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsIssueLetterModalOpen(false)}
                  className="px-4 py-2 bg-stone-100 font-bold rounded-xl text-stone-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-900 text-white font-black rounded-xl hover:bg-amber-800 transition-all shadow-sm flex items-center gap-1.5"
                >
                  <FileCheck className="w-4 h-4 text-amber-300" />
                  <span>Generate Official Appointment Letter</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 6: OFFICIAL APPOINTMENT LETTERHEAD PREVIEW (PRINTABLE) */}
      {selectedAppointmentLetter && (
        <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-8 space-y-6 shadow-2xl border border-stone-200 animate-fadeIn max-h-[92vh] overflow-y-auto">
            {/* Header Controls Bar */}
            <div className="flex flex-wrap items-center justify-between border-b border-stone-200 pb-3 gap-2">
              <span className="text-xs font-black uppercase text-amber-900 bg-amber-100 px-3 py-1 rounded-full border border-amber-300">
                Official Appointment Letter • Ref: {selectedAppointmentLetter.referenceNumber}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`https://proteinbowl.in/hr/letter/${selectedAppointmentLetter.referenceNumber}`);
                    confetti({ particleCount: 30, spread: 40 });
                  }}
                  className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs rounded-xl flex items-center gap-1.5 border border-stone-300"
                >
                  <Copy className="w-3.5 h-3.5 text-stone-600" />
                  <span>Copy Link</span>
                </button>

                <button
                  onClick={() => {
                    alert(`Appointment letter emailed to ${selectedAppointmentLetter.candidateEmail}`);
                    confetti({ particleCount: 30, spread: 40 });
                  }}
                  className="px-3 py-1.5 bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Email Candidate</span>
                </button>

                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs rounded-xl flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5 text-amber-300" />
                  <span>Print Letterhead</span>
                </button>

                <button onClick={() => setSelectedAppointmentLetter(null)} className="p-1.5 hover:bg-stone-100 rounded-full">
                  <X className="w-5 h-5 text-stone-500" />
                </button>
              </div>
            </div>

            {/* Print Friendly Letterhead Document */}
            <div className="border-2 border-stone-800 p-8 rounded-2xl space-y-6 text-stone-900 font-serif bg-white shadow-xs">
              {/* Company Header */}
              <div className="flex justify-between items-start border-b-2 border-stone-800 pb-4 font-sans">
                <div>
                  <h2 className="text-2xl font-black tracking-tight text-emerald-950">
                    PROTEINBITES CLOUD KITCHENS
                  </h2>
                  <p className="text-xs text-stone-600 font-medium">
                    Clinical Nutrition & Customized Dietetic Subscriptions Pvt. Ltd.
                  </p>
                  <p className="text-[10px] text-stone-500">
                    Corporate HQ: Infopark Phase 2 Road, Kakkanad, Kochi, Kerala - 682030 • CIN: U15400KL2024PTC081192
                  </p>
                </div>

                <div className="text-right text-xs">
                  <strong className="block text-amber-900 font-mono text-sm font-black">
                    Ref: {selectedAppointmentLetter.referenceNumber}
                  </strong>
                  <span className="text-stone-600 text-[11px] block mt-1">
                    Date of Issue: <strong>{selectedAppointmentLetter.issuedDate}</strong>
                  </span>
                </div>
              </div>

              {/* Addressee Info */}
              <div className="font-sans text-xs space-y-1 bg-stone-50 p-4 rounded-xl border border-stone-200">
                <p className="font-bold text-stone-500 text-[10px] uppercase">To,</p>
                <h3 className="text-sm font-black text-stone-900">{selectedAppointmentLetter.candidateName}</h3>
                <p className="text-stone-700 font-medium">{selectedAppointmentLetter.candidateAddress}</p>
                <p className="text-stone-600">Email: {selectedAppointmentLetter.candidateEmail} • Mobile: {selectedAppointmentLetter.candidatePhone}</p>
              </div>

              {/* Subject */}
              <div className="text-center my-4 font-sans">
                <h4 className="text-base font-black uppercase text-stone-900 underline decoration-amber-500 decoration-2 underline-offset-4">
                  LETTER OF APPOINTMENT - {selectedAppointmentLetter.designation.toUpperCase()}
                </h4>
              </div>

              {/* Letter Body Text */}
              <div className="space-y-4 text-xs leading-relaxed text-stone-800 font-sans">
                <p>
                  Dear <strong>{selectedAppointmentLetter.candidateName}</strong>,
                </p>

                <p>
                  With reference to your interview and subsequent discussions, we are pleased to appoint you as <strong>{selectedAppointmentLetter.designation}</strong> in the <strong>{selectedAppointmentLetter.department}</strong> department at <strong>ProteinBites Cloud Kitchens Pvt. Ltd.</strong> under the following terms and conditions:
                </p>

                <div className="space-y-2 bg-stone-50/80 p-4 rounded-xl border border-stone-300">
                  <h5 className="font-black text-stone-900 text-xs border-b border-stone-300 pb-1 uppercase">
                    1. Position & Duties
                  </h5>
                  <ul className="list-disc pl-5 space-y-1 text-stone-700 text-[11px]">
                    <li><strong>Employment Type:</strong> {selectedAppointmentLetter.employmentType}</li>
                    <li><strong>Work Location:</strong> {selectedAppointmentLetter.workLocation}</li>
                    <li><strong>Reporting Manager:</strong> {selectedAppointmentLetter.reportingManager}</li>
                    <li><strong>Target Date of Joining:</strong> On or before <strong>{selectedAppointmentLetter.joiningDate}</strong></li>
                    <li><strong>Probation Period:</strong> {selectedAppointmentLetter.probationPeriodMonths} Months from the date of joining, during which performance will be evaluated.</li>
                  </ul>
                </div>

                {/* Compensation Table */}
                <div className="space-y-2">
                  <h5 className="font-black text-stone-900 text-xs uppercase">
                    2. Remuneration & Compensation Structure
                  </h5>
                  <table className="w-full text-left border-collapse border border-stone-800 text-[11px]">
                    <thead>
                      <tr className="bg-stone-200 font-bold uppercase text-[10px]">
                        <th className="p-2 border border-stone-800">Salary Component</th>
                        <th className="p-2 border border-stone-800 text-right">Monthly (₹)</th>
                        <th className="p-2 border border-stone-800 text-right">Annualized (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-300 font-medium">
                      <tr>
                        <td className="p-2 border border-stone-300">Basic Salary</td>
                        <td className="p-2 border border-stone-300 text-right font-bold">₹{selectedAppointmentLetter.monthlyBaseSalary.toLocaleString()}</td>
                        <td className="p-2 border border-stone-300 text-right">₹{(selectedAppointmentLetter.monthlyBaseSalary * 12).toLocaleString()}</td>
                      </tr>
                      <tr>
                        <td className="p-2 border border-stone-300">Special & Flexible Allowances</td>
                        <td className="p-2 border border-stone-300 text-right font-bold">₹{selectedAppointmentLetter.monthlyAllowances.toLocaleString()}</td>
                        <td className="p-2 border border-stone-300 text-right">₹{(selectedAppointmentLetter.monthlyAllowances * 12).toLocaleString()}</td>
                      </tr>
                      <tr className="bg-amber-50 font-black">
                        <td className="p-2 border border-stone-800 text-stone-900">Gross Monthly Salary</td>
                        <td className="p-2 border border-stone-800 text-right text-stone-900">₹{selectedAppointmentLetter.monthlyGrossSalary.toLocaleString()}</td>
                        <td className="p-2 border border-stone-800 text-right text-stone-900">₹{(selectedAppointmentLetter.monthlyGrossSalary * 12).toLocaleString()}</td>
                      </tr>
                      <tr className="bg-emerald-900 text-white font-black">
                        <td className="p-2 border border-stone-800">TOTAL ANNUAL COST TO COMPANY (CTC)</td>
                        <td className="p-2 border border-stone-800 text-right">₹{selectedAppointmentLetter.monthlyGrossSalary.toLocaleString()} / mo</td>
                        <td className="p-2 border border-stone-800 text-right text-amber-300 text-xs">₹{selectedAppointmentLetter.annualCtc.toLocaleString()} / yr</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="space-y-1.5">
                  <h5 className="font-black text-stone-900 text-xs uppercase">3. Key Terms & Company Directives</h5>
                  <p className="text-[11px] text-stone-700">
                    - <strong>Confidentiality:</strong> You shall strictly maintain confidentiality regarding patient medical diet maps, proprietary cloud kitchen recipes, ingredient formulation ratios, and customer databases.
                  </p>
                  <p className="text-[11px] text-stone-700">
                    - <strong>Code of Conduct & Hygiene:</strong> Adherence to food safety regulations, clinical hygiene standards, and kitchen safety protocols is mandatory.
                  </p>
                  {selectedAppointmentLetter.specialTerms && (
                    <p className="text-[11px] text-amber-900 font-bold bg-amber-50 p-2 rounded-lg border border-amber-200">
                      - Special Directive: {selectedAppointmentLetter.specialTerms}
                    </p>
                  )}
                </div>

                <p className="text-stone-700 font-medium pt-2">
                  Please sign and return the duplicate copy of this letter as a token of your formal acceptance of the appointment and terms contained herein on or before <strong>{selectedAppointmentLetter.offerValidityDate}</strong>.
                </p>
              </div>

              {/* Signatures Footer */}
              <div className="pt-8 flex justify-between items-end text-xs font-sans border-t border-stone-300">
                <div>
                  <p className="font-bold text-stone-800">Candidate Acceptance Signature</p>
                  <div className="h-10"></div>
                  <p className="text-[10px] text-stone-500 font-mono">
                    Accepted By: ___________________________<br />
                    Date: ____________________
                  </p>
                </div>

                <div className="text-right">
                  <div className="w-24 h-12 border border-dashed border-stone-300 rounded-lg flex items-center justify-center text-[9px] text-stone-400 mb-2 ml-auto">
                    [ CORPORATE SEAL ]
                  </div>
                  <div className="border-b-2 border-stone-800 pb-1 mb-1 font-black text-stone-900">
                    Managing Director & Authorized Signatory
                  </div>
                  <p className="font-bold text-stone-800">{selectedAppointmentLetter.issuedBy}</p>
                  <p className="text-[10px] text-stone-500">ProteinBites Cloud Kitchens Pvt. Ltd.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
