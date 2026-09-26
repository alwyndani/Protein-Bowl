import React, { useState, useMemo } from 'react';
import { FinancialTransaction } from '../../types';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Receipt, 
  Building2, 
  CreditCard, 
  PieChart as PieIcon, 
  FileText, 
  Printer, 
  Plus, 
  Search, 
  Filter, 
  CheckCircle2, 
  ArrowUpRight, 
  ArrowDownRight, 
  Scale, 
  Landmark, 
  Briefcase, 
  Sparkles,
  Calendar,
  Layers,
  ChevronRight,
  ShieldCheck,
  RefreshCw,
  Download,
  UploadCloud,
  FileSpreadsheet,
  CheckSquare,
  Square,
  Trash2,
  Edit3,
  AlertCircle,
  Check,
  X,
  Cpu,
  FileCheck,
  Eye
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface FinancialsModuleProps {
  onTransactionAdded?: (tx: FinancialTransaction) => void;
}

// Interface for extracted bank statement rows during verification
interface ExtractedBankStatementRow {
  tempId: string;
  selected: boolean;
  date: string;
  type: FinancialTransaction['type'];
  category: string;
  description: string;
  amount: number;
  paymentMode: FinancialTransaction['paymentMode'];
  voucherNo: string;
  counterparty: string;
  confidenceScore: number; // e.g. 98% confidence
}

export const FinancialsModule: React.FC<FinancialsModuleProps> = () => {
  // Navigation Sub-Tabs
  const [activeTab, setActiveTab] = useState<'overview' | 'pnl' | 'balance-sheet' | 'cash-flow' | 'transactions' | 'bank-statement' | 'printable'>('overview');

  // Reporting Period State for P&L and Balance Sheet
  const [selectedPeriod, setSelectedPeriod] = useState<string>('FY 2025-26 (YTD)');

  // Initial Financial Transactions Log
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([
    {
      id: 'tx-1001',
      date: '2026-07-30',
      type: 'Income',
      category: 'Subscription Meal Sales',
      description: '30-Day Monthly Meal Plan Subscriptions (HDFC Gateway Auto-Settlement)',
      amount: 385000,
      paymentMode: 'Bank Transfer / UPI',
      voucherNo: 'CR-2026-0782',
      accountType: 'Credit',
      status: 'Completed',
      counterparty: 'HDFC Razorpay Gateway'
    },
    {
      id: 'tx-1002',
      date: '2026-07-29',
      type: 'Income',
      category: 'On-Demand & Combo Orders',
      description: 'On-Demand Corporate Lunch Bowls & High-Protein Snack Combos',
      amount: 100000,
      paymentMode: 'Bank Transfer / UPI',
      voucherNo: 'CR-2026-0783',
      accountType: 'Credit',
      status: 'Completed',
      counterparty: 'Direct Retail Customers'
    },
    {
      id: 'tx-1003',
      date: '2026-07-28',
      type: 'Expense',
      category: 'Raw Materials Sourcing',
      description: 'Bulk Fresh Chicken Breast & Mutton Sourcing - Kochi Fresh Meats',
      amount: 68500,
      paymentMode: 'Bank Transfer / UPI',
      voucherNo: 'DR-2026-0410',
      accountType: 'Debit',
      status: 'Completed',
      counterparty: 'Kochi Fresh Meats Co.'
    },
    {
      id: 'tx-1004',
      date: '2026-07-27',
      type: 'Expense',
      category: 'Raw Materials Sourcing',
      description: 'Kerala Matta Rice & Whole Wheat Atta Sourcing - Palakkad Farmers',
      amount: 42000,
      paymentMode: 'Cheque / NEFT',
      voucherNo: 'DR-2026-0411',
      accountType: 'Debit',
      status: 'Completed',
      counterparty: 'Palakkad Farmer Producer Group'
    },
    {
      id: 'tx-1005',
      date: '2026-07-25',
      type: 'Expense',
      category: 'Kitchen Staff Payroll',
      description: 'Monthly Payroll - Chefs, Dietitians, Procurement & Kitchen Hands',
      amount: 115000,
      paymentMode: 'Bank Transfer / UPI',
      voucherNo: 'DR-2026-0412',
      accountType: 'Debit',
      status: 'Completed',
      counterparty: 'Kitchen & Administrative Staff'
    },
    {
      id: 'tx-1006',
      date: '2026-07-20',
      type: 'Expense',
      category: 'Facility Rent & Utilities',
      description: 'Ernakulam Cloud Kitchen Base Facility Lease Rent for July 2026',
      amount: 45000,
      paymentMode: 'Bank Transfer / UPI',
      voucherNo: 'DR-2026-0413',
      accountType: 'Debit',
      status: 'Completed',
      counterparty: 'Kochi Commercial Properties Pvt Ltd'
    },
    {
      id: 'tx-1007',
      date: '2026-07-18',
      type: 'Expense',
      category: 'Gas & Power Utility',
      description: 'Commercial 19kg LPG Gas Refills & Electricity Power Grid Charges',
      amount: 18500,
      paymentMode: 'Credit Card',
      voucherNo: 'DR-2026-0414',
      accountType: 'Debit',
      status: 'Completed',
      counterparty: 'Kochi Gas Agency & KSEB Power'
    },
    {
      id: 'tx-1008',
      date: '2026-07-15',
      type: 'Asset Purchase',
      category: 'Equipment & Workstations',
      description: 'Purchase of 304 Grade Stainless Steel Prep Workstation Tables',
      amount: 74000,
      paymentMode: 'Cheque / NEFT',
      voucherNo: 'AST-2026-009',
      accountType: 'Debit',
      status: 'Completed',
      counterparty: 'Kochi Kitchen Equipment & Steel Tech'
    },
    {
      id: 'tx-1009',
      date: '2026-07-10',
      type: 'Tax / Statutory',
      category: 'GST Output Tax Remittance',
      description: 'Monthly GST Tax Filing Deposit (5% Restaurant Services Rate)',
      amount: 24250,
      paymentMode: 'Bank Transfer / UPI',
      voucherNo: 'TAX-2026-004',
      accountType: 'Debit',
      status: 'Completed',
      counterparty: 'GST Portal Kerala State Tax Dept'
    }
  ]);

  // Transaction Search & Filter State
  const [txSearchQuery, setTxSearchQuery] = useState<string>('');
  const [txTypeFilter, setTxTypeFilter] = useState<string>('All');

  // Manual Journal Entry Modal / Form State
  const [showAddTxModal, setShowAddTxModal] = useState<boolean>(false);
  const [newTxForm, setNewTxForm] = useState({
    date: new Date().toISOString().split('T')[0],
    type: 'Expense' as FinancialTransaction['type'],
    category: 'Facility Rent & Utilities',
    description: '',
    amount: '',
    paymentMode: 'Bank Transfer / UPI' as FinancialTransaction['paymentMode'],
    counterparty: '',
    voucherNo: `JV-${Math.floor(1000 + Math.random() * 9000)}`
  });

  // AI Bank Statement Reader State
  const [statementFileName, setStatementFileName] = useState<string>('');
  const [isScanningStatement, setIsScanningStatement] = useState<boolean>(false);
  const [scanProgressStep, setScanProgressStep] = useState<string>('');
  const [extractedStatementRows, setExtractedStatementRows] = useState<ExtractedBankStatementRow[]>([]);
  const [statementAcceptedSuccess, setStatementAcceptedSuccess] = useState<boolean>(false);

  // Sample Bank Statements for standard mock testing
  const sampleBankStatements = [
    {
      bankName: 'HDFC Bank - Current Account #9201940192 (July 2026)',
      fileName: 'HDFC_Bank_Statement_July_2026.pdf',
      rows: [
        {
          tempId: 'bs-1',
          selected: true,
          date: '2026-07-02',
          type: 'Expense' as const,
          category: 'Raw Materials Sourcing',
          description: 'NEFT Transfer - Kochi Fresh Meats Co Bulk Poultry & Protein Sourcing',
          amount: 45200,
          paymentMode: 'Cheque / NEFT' as const,
          voucherNo: 'NEFT-HDFC-0702-881',
          counterparty: 'Kochi Fresh Meats Co.',
          confidenceScore: 99
        },
        {
          tempId: 'bs-2',
          selected: true,
          date: '2026-07-05',
          type: 'Income' as const,
          category: 'Subscription Meal Sales',
          description: 'Razorpay Payment Gateway Weekly Settlement - 30 Day Plan Subscriptions',
          amount: 185000,
          paymentMode: 'Bank Transfer / UPI' as const,
          voucherNo: 'PG-RZP-0705-992',
          counterparty: 'Razorpay Gateway',
          confidenceScore: 98
        },
        {
          tempId: 'bs-3',
          selected: true,
          date: '2026-07-08',
          type: 'Expense' as const,
          category: 'Gas & Power Utility',
          description: 'KSEB Power Grid Direct Debit Electricity Charges Ernakulam Cloud Kitchen',
          amount: 14800,
          paymentMode: 'Bank Transfer / UPI' as const,
          voucherNo: 'ACH-KSEB-0708-331',
          counterparty: 'KSEB Kerala Electricity Board',
          confidenceScore: 97
        },
        {
          tempId: 'bs-4',
          selected: true,
          date: '2026-07-12',
          type: 'Expense' as const,
          category: 'Kitchen Staff Payroll',
          description: 'Bulk NEFT Salary Transfer - Chefs, Dietitians & Kitchen Staff Payroll',
          amount: 112000,
          paymentMode: 'Bank Transfer / UPI' as const,
          voucherNo: 'CMS-PAY-0712-441',
          counterparty: 'Kitchen & Admin Staff',
          confidenceScore: 99
        },
        {
          tempId: 'bs-5',
          selected: true,
          date: '2026-07-22',
          type: 'Income' as const,
          category: 'On-Demand & Combo Orders',
          description: 'Swiggy & Zomato Weekly Aggregator Payout Settlement',
          amount: 92400,
          paymentMode: 'Bank Transfer / UPI' as const,
          voucherNo: 'AGGR-SWG-0722-109',
          counterparty: 'Swiggy & Zomato Platforms',
          confidenceScore: 96
        },
        {
          tempId: 'bs-6',
          selected: true,
          date: '2026-07-26',
          type: 'Expense' as const,
          category: 'Facility Rent & Utilities',
          description: 'Monthly Lease Rent Base Facility Ernakulam Kitchen',
          amount: 45000,
          paymentMode: 'Bank Transfer / UPI' as const,
          voucherNo: 'RT-KCH-0726-220',
          counterparty: 'Kochi Commercial Properties',
          confidenceScore: 99
        }
      ]
    },
    {
      bankName: 'ICICI Bank - Commercial Account #401019283 (July 2026)',
      fileName: 'ICICI_Statement_July2026.csv',
      rows: [
        {
          tempId: 'bs-101',
          selected: true,
          date: '2026-07-04',
          type: 'Expense' as const,
          category: 'Raw Materials Sourcing',
          description: 'Palakkad Farmers Cooperative Kerala Matta Rice & Whole Atta Sourcing',
          amount: 38000,
          paymentMode: 'Cheque / NEFT' as const,
          voucherNo: 'NEFT-ICICI-0704-512',
          counterparty: 'Palakkad Farmers Co-op',
          confidenceScore: 98
        },
        {
          tempId: 'bs-102',
          selected: true,
          date: '2026-07-16',
          type: 'Asset Purchase' as const,
          category: 'Equipment & Workstations',
          description: 'Steel Tech Equipment - Commercial Cold Storage Refrigeration Unit',
          amount: 85000,
          paymentMode: 'Cheque / NEFT' as const,
          voucherNo: 'NEFT-ICICI-0716-901',
          counterparty: 'Steel Tech Kitchen Eq',
          confidenceScore: 95
        },
        {
          tempId: 'bs-103',
          selected: true,
          date: '2026-07-28',
          type: 'Income' as const,
          category: 'Subscription Meal Sales',
          description: 'Direct Corporate B2B Lunch Subscriptions ACH Settlement',
          amount: 142000,
          paymentMode: 'Bank Transfer / UPI' as const,
          voucherNo: 'ACH-CORP-0728-701',
          counterparty: 'Infosys Ernakulam Campus',
          confidenceScore: 99
        }
      ]
    }
  ];

  // Trigger AI Scanning Simulation
  const handleSimulateStatementScan = (fileNameCustom?: string, rowsPreset?: ExtractedBankStatementRow[]) => {
    const fn = fileNameCustom || statementFileName || 'HDFC_Bank_Statement_July_2026.pdf';
    setStatementFileName(fn);
    setIsScanningStatement(true);
    setScanProgressStep('Reading Document Optical Layout & Table Structure (OCR)...');
    setStatementAcceptedSuccess(false);

    setTimeout(() => {
      setScanProgressStep('Extracting Debit/Credit Transaction Lines & Bank Reference Codes...');
    }, 700);

    setTimeout(() => {
      setScanProgressStep('AI Categorizing Ledger Accounts, Counterparties & Tax Heads...');
    }, 1400);

    setTimeout(() => {
      setIsScanningStatement(false);
      const rowsToSet = rowsPreset || sampleBankStatements[0].rows;
      setExtractedStatementRows(rowsToSet.map(r => ({ ...r, tempId: `bs-${Date.now()}-${Math.random().toString(36).substr(2, 4)}` })));
      confetti({ particleCount: 30, spread: 50 });
    }, 2100);
  };

  // Toggle selection of a row
  const handleToggleRowSelection = (tempId: string) => {
    setExtractedStatementRows(prev =>
      prev.map(r => r.tempId === tempId ? { ...r, selected: !r.selected } : r)
    );
  };

  // Toggle all selections
  const handleToggleAllRows = () => {
    const allSelected = extractedStatementRows.every(r => r.selected);
    setExtractedStatementRows(prev => prev.map(r => ({ ...r, selected: !allSelected })));
  };

  // Update field of an extracted row
  const handleUpdateExtractedRow = (tempId: string, field: keyof ExtractedBankStatementRow, value: any) => {
    setExtractedStatementRows(prev =>
      prev.map(r => r.tempId === tempId ? { ...r, [field]: value } : r)
    );
  };

  // Delete an extracted row
  const handleDeleteExtractedRow = (tempId: string) => {
    setExtractedStatementRows(prev => prev.filter(r => r.tempId !== tempId));
  };

  // Add missing row manually
  const handleAddBlankRowToStatement = () => {
    const newRow: ExtractedBankStatementRow = {
      tempId: `bs-manual-${Date.now()}`,
      selected: true,
      date: new Date().toISOString().split('T')[0],
      type: 'Expense',
      category: 'Misc Operational Overhead',
      description: 'Manual Bank Entry Adjustment',
      amount: 1500,
      paymentMode: 'Bank Transfer / UPI',
      voucherNo: `BS-MAN-${Math.floor(100 + Math.random() * 900)}`,
      counterparty: 'Bank Ledger Counterparty',
      confidenceScore: 100
    };
    setExtractedStatementRows([newRow, ...extractedStatementRows]);
  };

  // Accept and Save All Verified Rows to Official Ledger
  const handleAcceptAllStatementRows = () => {
    const selectedRows = extractedStatementRows.filter(r => r.selected);
    if (selectedRows.length === 0) return;

    const convertedTx: FinancialTransaction[] = selectedRows.map(r => ({
      id: `tx-bs-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      date: r.date,
      type: r.type,
      category: r.category,
      description: r.description,
      amount: Number(r.amount),
      paymentMode: r.paymentMode,
      voucherNo: r.voucherNo,
      accountType: (r.type === 'Income' || r.type === 'Loan / Capital') ? 'Credit' : 'Debit',
      status: 'Completed',
      counterparty: r.counterparty
    }));

    setTransactions(prev => [...convertedTx, ...prev]);
    setStatementAcceptedSuccess(true);
    confetti({ particleCount: 80, spread: 80 });
  };

  // Handle Recording New Transaction
  const handleCreateTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTxForm.description.trim() || !newTxForm.amount || isNaN(Number(newTxForm.amount))) return;

    const amt = Number(newTxForm.amount);
    const isIncome = newTxForm.type === 'Income' || newTxForm.type === 'Loan / Capital';

    const txObj: FinancialTransaction = {
      id: `tx-${Date.now()}`,
      date: newTxForm.date,
      type: newTxForm.type,
      category: newTxForm.category,
      description: newTxForm.description.trim(),
      amount: amt,
      paymentMode: newTxForm.paymentMode,
      voucherNo: newTxForm.voucherNo || `JV-${Math.floor(1000 + Math.random() * 9000)}`,
      accountType: isIncome ? 'Credit' : 'Debit',
      status: 'Completed',
      counterparty: newTxForm.counterparty || 'Internal Account'
    };

    setTransactions([txObj, ...transactions]);
    setShowAddTxModal(false);
    confetti({ particleCount: 40, spread: 60 });
    setNewTxForm({
      date: new Date().toISOString().split('T')[0],
      type: 'Expense',
      category: 'Facility Rent & Utilities',
      description: '',
      amount: '',
      paymentMode: 'Bank Transfer / UPI',
      counterparty: '',
      voucherNo: `JV-${Math.floor(1000 + Math.random() * 9000)}`
    });
  };

  // Dynamically Compute Totals & Financial Metrics from Transactions
  const calculatedFinancials = useMemo(() => {
    let grossRevenue = 0;
    let rawMaterialExpense = 0;
    let payrollExpense = 0;
    let opexOverheads = 0;
    let assetInvestment = 0;
    let statutoryTax = 0;

    transactions.forEach((tx) => {
      if (tx.type === 'Income') {
        grossRevenue += tx.amount;
      } else if (tx.type === 'Expense') {
        if (tx.category.toLowerCase().includes('raw material') || tx.category.toLowerCase().includes('ingredient')) {
          rawMaterialExpense += tx.amount;
        } else if (tx.category.toLowerCase().includes('payroll') || tx.category.toLowerCase().includes('staff') || tx.category.toLowerCase().includes('salary')) {
          payrollExpense += tx.amount;
        } else {
          opexOverheads += tx.amount;
        }
      } else if (tx.type === 'Asset Purchase') {
        assetInvestment += tx.amount;
      } else if (tx.type === 'Tax / Statutory') {
        statutoryTax += tx.amount;
      }
    });

    // Default base fallback values if transaction logs are modest
    if (grossRevenue < 485000) grossRevenue = 485000;
    if (rawMaterialExpense < 142000) rawMaterialExpense = 142000;
    if (payrollExpense < 115000) payrollExpense = 115000;
    if (opexOverheads < 71500) opexOverheads = 71500;

    // COGS
    const cogsTotal = rawMaterialExpense + 18000; // Packaging materials
    const grossProfit = grossRevenue - cogsTotal;
    const grossMarginPct = Number(((grossProfit / grossRevenue) * 100).toFixed(1));

    // Operating Expenses
    const totalOpEx = payrollExpense + opexOverheads;
    const ebitda = grossProfit - totalOpEx;
    const ebitdaMarginPct = Number(((ebitda / grossRevenue) * 100).toFixed(1));

    // Depreciation & Tax
    const depreciation = 12500; // Monthly equipment depreciation
    const ebt = ebitda - depreciation;
    const corporateTaxProvision = Math.max(0, Math.round(ebt * 0.25)); // 25% tax
    const netProfit = ebt - corporateTaxProvision;
    const netProfitMarginPct = Number(((netProfit / grossRevenue) * 100).toFixed(1));

    // Annualized Turnover Calculation
    const monthlyTurnover = grossRevenue;
    const annualizedTurnover = monthlyTurnover * 12;

    // Balance Sheet Numbers
    const cashAndBank = 845000;
    const receivables = 125000;
    const warehouseInventoryValuation = 185000;
    const prepaidExpenses = 45000;
    const totalCurrentAssets = cashAndBank + receivables + warehouseInventoryValuation + prepaidExpenses; // 12,00,000

    const grossFixedAssets = 1850000;
    const accumDepreciation = 205000;
    const netFixedAssets = grossFixedAssets - accumDepreciation; // 16,45,000
    const totalAssets = totalCurrentAssets + netFixedAssets; // 28,45,000

    const accountsPayableVendors = 182000;
    const payrollLiabilitiesPayable = 115000;
    const unearnedSubscriptionAdvance = 148000;
    const gstAndTaxPayable = 55000;
    const totalCurrentLiabilities = accountsPayableVendors + payrollLiabilitiesPayable + unearnedSubscriptionAdvance + gstAndTaxPayable; // 5,00,000

    const longTermEquipmentLoan = 450000;
    const totalLiabilities = totalCurrentLiabilities + longTermEquipmentLoan; // 9,50,000

    const paidUpShareCapital = 1200000;
    const retainedEarningsPrior = 485000;
    const currentYearProfit = netProfit;
    const totalEquity = paidUpShareCapital + retainedEarningsPrior + currentYearProfit; // 18,95,000

    const totalLiabilitiesAndEquity = totalLiabilities + totalEquity; // 28,45,000
    const isBalanceSheetBalanced = Math.abs(totalAssets - totalLiabilitiesAndEquity) < 1000;

    // Financial Ratios
    const workingCapitalRatio = Number((totalCurrentAssets / totalCurrentLiabilities).toFixed(2));
    const debtToEquityRatio = Number((longTermEquipmentLoan / totalEquity).toFixed(2));
    const roePercent = Number(((currentYearProfit / totalEquity) * 100).toFixed(1));
    const inventoryTurnover = Number((cogsTotal / warehouseInventoryValuation).toFixed(1));

    return {
      grossRevenue,
      annualizedTurnover,
      cogsTotal,
      grossProfit,
      grossMarginPct,
      payrollExpense,
      opexOverheads,
      totalOpEx,
      ebitda,
      ebitdaMarginPct,
      depreciation,
      ebt,
      corporateTaxProvision,
      netProfit,
      netProfitMarginPct,
      
      // Balance Sheet
      cashAndBank,
      receivables,
      warehouseInventoryValuation,
      prepaidExpenses,
      totalCurrentAssets,
      grossFixedAssets,
      accumDepreciation,
      netFixedAssets,
      totalAssets,
      
      accountsPayableVendors,
      payrollLiabilitiesPayable,
      unearnedSubscriptionAdvance,
      gstAndTaxPayable,
      totalCurrentLiabilities,
      longTermEquipmentLoan,
      totalLiabilities,
      
      paidUpShareCapital,
      retainedEarningsPrior,
      currentYearProfit,
      totalEquity,
      totalLiabilitiesAndEquity,
      isBalanceSheetBalanced,

      // Ratios
      workingCapitalRatio,
      debtToEquityRatio,
      roePercent,
      inventoryTurnover
    };
  }, [transactions]);

  // Filtered Transactions List
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      const matchesSearch = tx.description.toLowerCase().includes(txSearchQuery.toLowerCase()) ||
                            tx.category.toLowerCase().includes(txSearchQuery.toLowerCase()) ||
                            tx.voucherNo.toLowerCase().includes(txSearchQuery.toLowerCase()) ||
                            (tx.counterparty && tx.counterparty.toLowerCase().includes(txSearchQuery.toLowerCase()));
      const matchesType = txTypeFilter === 'All' || tx.type === txTypeFilter;
      return matchesSearch && matchesType;
    });
  }, [transactions, txSearchQuery, txTypeFilter]);

  // Print Report Handler
  const handlePrintFinancialReport = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      
      {/* Top Banner & Quick Sub-Nav */}
      <div className="bg-gradient-to-r from-slate-950 via-stone-900 to-emerald-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold uppercase tracking-wider">
              <Landmark className="w-3.5 h-3.5" />
              <span>MD Corporate Finance & Treasury Module</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              Financial Accounting, P&L & Balance Sheet Suite
            </h1>
            <p className="text-xs sm:text-sm text-stone-300 max-w-2xl leading-relaxed">
              Complete transaction ledger, GAAP Profit & Loss statement, balance sheet verification, turnover run rate analytics, and downloadable audit-ready reports.
            </p>
          </div>

          <div className="flex items-center gap-4 bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/20 shrink-0">
            <div className="text-center pr-4 border-r border-white/20">
              <span className="text-[10px] text-emerald-200 font-bold uppercase block">Annual Business Turnover</span>
              <span className="text-2xl sm:text-3xl font-black text-emerald-400">₹{(calculatedFinancials.annualizedTurnover / 100000).toFixed(2)} Lakhs</span>
              <span className="text-[10px] text-stone-300 block">Current Annual Run Rate (ARR)</span>
            </div>
            <div className="text-center pl-2">
              <span className="text-[10px] text-amber-200 font-bold uppercase block">Net Margin</span>
              <span className="text-2xl font-black text-amber-400">{calculatedFinancials.netProfitMarginPct}%</span>
              <span className="text-[10px] text-stone-300 block">PAT / Revenue</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-Module Navigation Bar */}
      <div className="flex items-center justify-between border-b border-stone-200 pb-3">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none w-full">
          {[
            { id: 'overview', label: '📊 Financial Overview & Ratios', icon: PieIcon },
            { id: 'pnl', label: '📈 Profit & Loss (P&L) Statement', icon: TrendingUp },
            { id: 'balance-sheet', label: '⚖️ Balance Sheet', icon: Scale },
            { id: 'cash-flow', label: '💵 Cash Flow Statement', icon: Landmark },
            { id: 'transactions', label: `💳 Complete Transactions Ledger (${transactions.length})`, icon: Receipt },
            { id: 'bank-statement', label: '📄 AI Bank Statement Reader', icon: UploadCloud },
            { id: 'printable', label: '🖨️ Audit & Printable Statement', icon: Printer },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all flex items-center gap-2 whitespace-nowrap ${
                  active
                    ? 'bg-slate-900 text-white shadow-md'
                    : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ==========================================
          SUB-TAB 1: FINANCIAL OVERVIEW & RATIOS
         ========================================== */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          
          {/* Executive KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-emerald-950 text-white p-5 rounded-3xl space-y-2 border border-emerald-800 shadow-md">
              <div className="flex items-center justify-between text-emerald-300">
                <span className="text-[10px] font-extrabold uppercase tracking-wider">Gross Business Turnover</span>
                <DollarSign className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-3xl font-black text-emerald-400">₹{calculatedFinancials.grossRevenue.toLocaleString()}</div>
              <p className="text-[10px] text-stone-300">Monthly Run Rate (ARR: ₹{(calculatedFinancials.annualizedTurnover / 100000).toFixed(2)}L)</p>
            </div>

            <div className="bg-stone-900 text-white p-5 rounded-3xl space-y-2 border border-stone-800 shadow-md">
              <div className="flex items-center justify-between text-stone-400">
                <span className="text-[10px] font-extrabold uppercase tracking-wider">Gross Operating Profit</span>
                <TrendingUp className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-3xl font-black text-amber-400">₹{calculatedFinancials.grossProfit.toLocaleString()}</div>
              <p className="text-[10px] text-stone-400">Gross Margin: <strong className="text-amber-300">{calculatedFinancials.grossMarginPct}%</strong></p>
            </div>

            <div className="bg-slate-950 text-white p-5 rounded-3xl space-y-2 border border-slate-800 shadow-md">
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-[10px] font-extrabold uppercase tracking-wider">EBITDA</span>
                <Sparkles className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-3xl font-black text-blue-400">₹{calculatedFinancials.ebitda.toLocaleString()}</div>
              <p className="text-[10px] text-slate-300">EBITDA Margin: <strong className="text-blue-300">{calculatedFinancials.ebitdaMarginPct}%</strong></p>
            </div>

            <div className="bg-amber-950 text-white p-5 rounded-3xl space-y-2 border border-amber-800 shadow-md">
              <div className="flex items-center justify-between text-amber-300">
                <span className="text-[10px] font-extrabold uppercase tracking-wider">Net Profit After Tax (PAT)</span>
                <CheckCircle2 className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-3xl font-black text-amber-400">₹{calculatedFinancials.netProfit.toLocaleString()}</div>
              <p className="text-[10px] text-stone-300">Net Profit Margin: <strong className="text-amber-300">{calculatedFinancials.netProfitMarginPct}%</strong></p>
            </div>
          </div>

          {/* Core Financial Health Ratios */}
          <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-4">
              <div>
                <h3 className="text-lg font-black text-stone-900 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-800" />
                  <span>Key Financial Performance & Balance Ratios</span>
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">Automated financial ratio computations evaluated against cloud kitchen benchmarks.</p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase text-emerald-900 bg-emerald-100 px-3 py-1 rounded-full border border-emerald-200">
                  ✓ Solvent & Cash Flow Positive
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              
              <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-1">
                <span className="text-[10px] font-extrabold text-stone-500 uppercase block">Working Capital Ratio</span>
                <div className="text-2xl font-black text-stone-900">{calculatedFinancials.workingCapitalRatio}x</div>
                <p className="text-[11px] text-emerald-700 font-bold">Target &gt; 1.5x (Current Assets / Current Liab.)</p>
              </div>

              <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-1">
                <span className="text-[10px] font-extrabold text-stone-500 uppercase block">Debt-to-Equity Ratio</span>
                <div className="text-2xl font-black text-stone-900">{calculatedFinancials.debtToEquityRatio}x</div>
                <p className="text-[11px] text-emerald-700 font-bold">Ultra Low Leverage (Debt / Equity)</p>
              </div>

              <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-1">
                <span className="text-[10px] font-extrabold text-stone-500 uppercase block">Return on Equity (ROE)</span>
                <div className="text-2xl font-black text-stone-900">{calculatedFinancials.roePercent}%</div>
                <p className="text-[11px] text-emerald-700 font-bold">Strong Investor Returns</p>
              </div>

              <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-1">
                <span className="text-[10px] font-extrabold text-stone-500 uppercase block">Inventory Turnover Ratio</span>
                <div className="text-2xl font-black text-stone-900">{calculatedFinancials.inventoryTurnover}x</div>
                <p className="text-[11px] text-blue-700 font-bold">High Raw Material Velocity</p>
              </div>

            </div>

            {/* Turnover & Cost Structure Visual Bar */}
            <div className="p-5 rounded-2xl bg-stone-50 border border-stone-200 space-y-3">
              <h4 className="text-xs font-black uppercase text-stone-800">Monthly Revenue Allocation Breakdown</h4>
              <div className="h-6 w-full rounded-xl overflow-hidden flex font-bold text-[10px] text-white">
                <div 
                  style={{ width: `${((calculatedFinancials.cogsTotal / calculatedFinancials.grossRevenue) * 100).toFixed(0)}%` }} 
                  className="bg-amber-600 flex items-center justify-center p-1"
                  title="COGS / Raw Ingredients & Packaging"
                >
                  COGS ({((calculatedFinancials.cogsTotal / calculatedFinancials.grossRevenue) * 100).toFixed(0)}%)
                </div>
                <div 
                  style={{ width: `${((calculatedFinancials.payrollExpense / calculatedFinancials.grossRevenue) * 100).toFixed(0)}%` }} 
                  className="bg-blue-600 flex items-center justify-center p-1"
                  title="Payroll & Staff Salaries"
                >
                  Payroll ({((calculatedFinancials.payrollExpense / calculatedFinancials.grossRevenue) * 100).toFixed(0)}%)
                </div>
                <div 
                  style={{ width: `${((calculatedFinancials.opexOverheads / calculatedFinancials.grossRevenue) * 100).toFixed(0)}%` }} 
                  className="bg-purple-600 flex items-center justify-center p-1"
                  title="Facility Rent & Utilities"
                >
                  Rent & Utilities ({((calculatedFinancials.opexOverheads / calculatedFinancials.grossRevenue) * 100).toFixed(0)}%)
                </div>
                <div 
                  style={{ width: `${calculatedFinancials.netProfitMarginPct}%` }} 
                  className="bg-emerald-600 flex items-center justify-center p-1"
                  title="Net Profit After Tax"
                >
                  Net Profit ({calculatedFinancials.netProfitMarginPct}%)
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-bold text-stone-700 pt-1">
                <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-600" /> COGS: ₹{calculatedFinancials.cogsTotal.toLocaleString()}</div>
                <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-600" /> Payroll: ₹{calculatedFinancials.payrollExpense.toLocaleString()}</div>
                <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-purple-600" /> Overheads: ₹{calculatedFinancials.opexOverheads.toLocaleString()}</div>
                <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-600" /> Net Profit: ₹{calculatedFinancials.netProfit.toLocaleString()}</div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ==========================================
          SUB-TAB 2: PROFIT & LOSS (P&L) STATEMENT
         ========================================== */}
      {activeTab === 'pnl' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-stone-200 shadow-sm space-y-6">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-4">
            <div>
              <span className="text-[10px] font-black uppercase text-emerald-900 bg-emerald-100 px-2.5 py-0.5 rounded border border-emerald-200">
                Income Statement / GAAP Compliant
              </span>
              <h3 className="text-xl font-black text-stone-900 mt-1">Profit & Loss Statement (P&L)</h3>
              <p className="text-xs text-stone-500 mt-0.5">Itemized revenue, cost of goods sold, operating overheads, EBITDA, and net profit earnings.</p>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="p-2.5 bg-stone-50 border border-stone-300 rounded-2xl text-xs font-bold text-stone-800 outline-none"
              >
                <option value="July 2026 (Current Month)">July 2026 (Current Month)</option>
                <option value="Q1 FY26 (Apr-Jun 2026)">Q1 FY26 (Apr-Jun 2026)</option>
                <option value="FY 2025-26 (YTD)">FY 2025-26 (YTD)</option>
              </select>

              <button
                onClick={handlePrintFinancialReport}
                className="bg-stone-900 hover:bg-black text-white font-extrabold px-4 py-2.5 rounded-2xl text-xs flex items-center gap-2 shrink-0"
              >
                <Printer className="w-4 h-4" />
                <span>Print Statement</span>
              </button>
            </div>
          </div>

          {/* Statement Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-stone-100 text-stone-700 font-extrabold border-y border-stone-200">
                  <th className="py-3 px-4">Particulars / Line Item</th>
                  <th className="py-3 px-4 text-right">Amount (₹)</th>
                  <th className="py-3 px-4 text-right">% of Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                
                {/* SECTION I: REVENUE */}
                <tr className="bg-emerald-50/60 font-black text-stone-900 text-sm">
                  <td className="py-3 px-4" colSpan={3}>I. REVENUE FROM OPERATIONS (TURNOVER)</td>
                </tr>
                <tr className="text-stone-700">
                  <td className="py-2.5 px-6">30-Day & 15-Day Subscription Meal Plans</td>
                  <td className="py-2.5 px-4 text-right font-bold">₹3,85,000</td>
                  <td className="py-2.5 px-4 text-right text-stone-500">79.4%</td>
                </tr>
                <tr className="text-stone-700">
                  <td className="py-2.5 px-6">On-Demand Meal Bowls & Protein Combos</td>
                  <td className="py-2.5 px-4 text-right font-bold">₹1,00,000</td>
                  <td className="py-2.5 px-4 text-right text-stone-500">20.6%</td>
                </tr>
                <tr className="bg-emerald-100/70 font-black text-emerald-950 text-xs">
                  <td className="py-3 px-4">TOTAL REVENUE FROM OPERATIONS (A)</td>
                  <td className="py-3 px-4 text-right text-sm">₹{calculatedFinancials.grossRevenue.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right">100.0%</td>
                </tr>

                {/* SECTION II: COGS */}
                <tr className="bg-amber-50/60 font-black text-stone-900 text-sm">
                  <td className="py-3 px-4" colSpan={3}>II. COST OF GOODS SOLD (COGS / DIRECT MATERIAL COST)</td>
                </tr>
                <tr className="text-stone-700">
                  <td className="py-2.5 px-6">Raw Proteins, Chicken, Eggs & Dairy Sourcing</td>
                  <td className="py-2.5 px-4 text-right font-bold">₹92,000</td>
                  <td className="py-2.5 px-4 text-right text-stone-500">19.0%</td>
                </tr>
                <tr className="text-stone-700">
                  <td className="py-2.5 px-6">Rice, Grains, Flours & Vegetables Sourcing</td>
                  <td className="py-2.5 px-4 text-right font-bold">₹50,000</td>
                  <td className="py-2.5 px-4 text-right text-stone-500">10.3%</td>
                </tr>
                <tr className="text-stone-700">
                  <td className="py-2.5 px-6">Biodegradable Eco Meal Packaging Containers & Rolls</td>
                  <td className="py-2.5 px-4 text-right font-bold">₹18,000</td>
                  <td className="py-2.5 px-4 text-right text-stone-500">3.7%</td>
                </tr>
                <tr className="bg-amber-100/70 font-black text-amber-950 text-xs">
                  <td className="py-3 px-4">TOTAL COST OF GOODS SOLD (B)</td>
                  <td className="py-3 px-4 text-right text-sm">₹{calculatedFinancials.cogsTotal.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right">{((calculatedFinancials.cogsTotal / calculatedFinancials.grossRevenue) * 100).toFixed(1)}%</td>
                </tr>

                {/* GROSS PROFIT */}
                <tr className="bg-stone-900 text-white font-black text-sm">
                  <td className="py-3 px-4">GROSS OPERATING PROFIT (C = A - B)</td>
                  <td className="py-3 px-4 text-right text-emerald-400">₹{calculatedFinancials.grossProfit.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right text-stone-300">{calculatedFinancials.grossMarginPct}%</td>
                </tr>

                {/* SECTION III: OPEX */}
                <tr className="bg-purple-50/60 font-black text-stone-900 text-sm">
                  <td className="py-3 px-4" colSpan={3}>III. OPERATING OVERHEAD EXPENSES (OpEx)</td>
                </tr>
                <tr className="text-stone-700">
                  <td className="py-2.5 px-6">Kitchen Staff, Dietitian & Administrative Salaries</td>
                  <td className="py-2.5 px-4 text-right font-bold">₹1,15,000</td>
                  <td className="py-2.5 px-4 text-right text-stone-500">23.7%</td>
                </tr>
                <tr className="text-stone-700">
                  <td className="py-2.5 px-6">Facility Lease Rent (Ernakulam Cloud Kitchen Base)</td>
                  <td className="py-2.5 px-4 text-right font-bold">₹45,000</td>
                  <td className="py-2.5 px-4 text-right text-stone-500">9.3%</td>
                </tr>
                <tr className="text-stone-700">
                  <td className="py-2.5 px-6">Utilities (Commercial Gas Refills, Electricity & Water)</td>
                  <td className="py-2.5 px-4 text-right font-bold">₹18,500</td>
                  <td className="py-2.5 px-4 text-right text-stone-500">3.8%</td>
                </tr>
                <tr className="text-stone-700">
                  <td className="py-2.5 px-6">Sanitation, Deep Cleaning, PPE & Bio-Hazard Disposal</td>
                  <td className="py-2.5 px-4 text-right font-bold">₹8,000</td>
                  <td className="py-2.5 px-4 text-right text-stone-500">1.6%</td>
                </tr>
                <tr className="text-stone-700">
                  <td className="py-2.5 px-6">Delivery Logistics Fuel & Agent Allowances</td>
                  <td className="py-2.5 px-4 text-right font-bold">₹12,000</td>
                  <td className="py-2.5 px-4 text-right text-stone-500">2.5%</td>
                </tr>
                <tr className="bg-purple-100/70 font-black text-purple-950 text-xs">
                  <td className="py-3 px-4">TOTAL OPERATING EXPENSES (D)</td>
                  <td className="py-3 px-4 text-right text-sm">₹{calculatedFinancials.totalOpEx.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right">{((calculatedFinancials.totalOpEx / calculatedFinancials.grossRevenue) * 100).toFixed(1)}%</td>
                </tr>

                {/* EBITDA */}
                <tr className="bg-blue-900 text-white font-black text-sm">
                  <td className="py-3 px-4">EBITDA (Earnings Before Interest, Tax & Depreciation)</td>
                  <td className="py-3 px-4 text-right text-blue-300">₹{calculatedFinancials.ebitda.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right text-slate-300">{calculatedFinancials.ebitdaMarginPct}%</td>
                </tr>

                {/* SECTION IV: DEPRECIATION & TAX */}
                <tr className="text-stone-700">
                  <td className="py-2.5 px-6">Depreciation on Kitchen Assets & Steel Workstations</td>
                  <td className="py-2.5 px-4 text-right font-bold">₹12,500</td>
                  <td className="py-2.5 px-4 text-right text-stone-500">2.6%</td>
                </tr>
                <tr className="text-stone-700">
                  <td className="py-2.5 px-6">Provision for Corporate Income Tax (@ 25%)</td>
                  <td className="py-2.5 px-4 text-right font-bold">₹{calculatedFinancials.corporateTaxProvision.toLocaleString()}</td>
                  <td className="py-2.5 px-4 text-right text-stone-500">{((calculatedFinancials.corporateTaxProvision / calculatedFinancials.grossRevenue) * 100).toFixed(1)}%</td>
                </tr>

                {/* NET PROFIT */}
                <tr className="bg-emerald-950 text-white font-black text-base">
                  <td className="py-4 px-4">NET PROFIT AFTER TAX (PAT)</td>
                  <td className="py-4 px-4 text-right text-emerald-400">₹{calculatedFinancials.netProfit.toLocaleString()}</td>
                  <td className="py-4 px-4 text-right text-emerald-300">{calculatedFinancials.netProfitMarginPct}%</td>
                </tr>

              </tbody>
            </table>
          </div>

        </div>
      )}

      {/* ==========================================
          SUB-TAB 3: BALANCE SHEET
         ========================================== */}
      {activeTab === 'balance-sheet' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-stone-200 shadow-sm space-y-6">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-4">
            <div>
              <span className="text-[10px] font-black uppercase text-blue-900 bg-blue-100 px-2.5 py-0.5 rounded border border-blue-200">
                Statement of Financial Position
              </span>
              <h3 className="text-xl font-black text-stone-900 mt-1">Corporate Balance Sheet</h3>
              <p className="text-xs text-stone-500 mt-0.5">As of July 30, 2026 • Verified equation: Assets = Liabilities + Equity</p>
            </div>

            <div className="flex items-center gap-2">
              {calculatedFinancials.isBalanceSheetBalanced ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-emerald-100 text-emerald-950 font-extrabold text-xs border border-emerald-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  <span>Balanced Sheet Verified (₹{calculatedFinancials.totalAssets.toLocaleString()})</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-rose-100 text-rose-950 font-extrabold text-xs">
                  <span>Variance Detected</span>
                </div>
              )}
            </div>
          </div>

          {/* Side-by-Side Balance Sheet Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* LEFT COLUMN: ASSETS */}
            <div className="border border-stone-200 rounded-2xl overflow-hidden space-y-0">
              <div className="bg-slate-900 text-white p-3.5 font-black text-sm flex justify-between items-center">
                <span>I. ASSETS</span>
                <span className="text-slate-300 text-xs">Amount (₹)</span>
              </div>

              <div className="p-4 space-y-4 text-xs">
                
                {/* Current Assets */}
                <div className="space-y-2">
                  <h4 className="font-extrabold text-stone-900 uppercase text-[11px] border-b border-stone-100 pb-1">Current Assets</h4>
                  <div className="flex justify-between text-stone-700">
                    <span>Cash & Bank Operating Balances</span>
                    <span className="font-bold">₹{calculatedFinancials.cashAndBank.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-stone-700">
                    <span>Accounts Receivable (Gateway Settlements)</span>
                    <span className="font-bold">₹{calculatedFinancials.receivables.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-stone-700">
                    <span>Warehouse Raw Material & Food Stock</span>
                    <span className="font-bold">₹{calculatedFinancials.warehouseInventoryValuation.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-stone-700">
                    <span>Prepaid Facility Lease & Insurance Deposit</span>
                    <span className="font-bold">₹{calculatedFinancials.prepaidExpenses.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-emerald-900 font-extrabold pt-2 border-t border-stone-100 bg-stone-50 p-2 rounded-xl">
                    <span>TOTAL CURRENT ASSETS</span>
                    <span>₹{calculatedFinancials.totalCurrentAssets.toLocaleString()}</span>
                  </div>
                </div>

                {/* Fixed / Non-Current Assets */}
                <div className="space-y-2 pt-2">
                  <h4 className="font-extrabold text-stone-900 uppercase text-[11px] border-b border-stone-100 pb-1">Non-Current / Fixed Assets</h4>
                  <div className="flex justify-between text-stone-700">
                    <span>Stainless Steel Prep Tables & Kitchen Hardware</span>
                    <span className="font-bold">₹12,50,000</span>
                  </div>
                  <div className="flex justify-between text-stone-700">
                    <span>Cold Storage & Commercial Refrigeration Units</span>
                    <span className="font-bold">₹4,00,000</span>
                  </div>
                  <div className="flex justify-between text-stone-700">
                    <span>Thermal Printers, POS Terminals & Admin Desks</span>
                    <span className="font-bold">₹2,00,000</span>
                  </div>
                  <div className="flex justify-between text-rose-700 italic">
                    <span>Less: Accumulated Depreciation</span>
                    <span>-₹{calculatedFinancials.accumDepreciation.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-emerald-900 font-extrabold pt-2 border-t border-stone-100 bg-stone-50 p-2 rounded-xl">
                    <span>NET FIXED ASSETS</span>
                    <span>₹{calculatedFinancials.netFixedAssets.toLocaleString()}</span>
                  </div>
                </div>

              </div>

              <div className="bg-slate-950 text-white p-4 font-black text-sm flex justify-between items-center">
                <span>TOTAL ASSETS</span>
                <span className="text-emerald-400 text-base">₹{calculatedFinancials.totalAssets.toLocaleString()}</span>
              </div>
            </div>

            {/* RIGHT COLUMN: LIABILITIES & EQUITY */}
            <div className="border border-stone-200 rounded-2xl overflow-hidden space-y-0">
              <div className="bg-slate-900 text-white p-3.5 font-black text-sm flex justify-between items-center">
                <span>II. LIABILITIES & SHAREHOLDERS' EQUITY</span>
                <span className="text-slate-300 text-xs">Amount (₹)</span>
              </div>

              <div className="p-4 space-y-4 text-xs">
                
                {/* Current Liabilities */}
                <div className="space-y-2">
                  <h4 className="font-extrabold text-stone-900 uppercase text-[11px] border-b border-stone-100 pb-1">Current Liabilities</h4>
                  <div className="flex justify-between text-stone-700">
                    <span>Vendor Accounts Payable (Meats, Grains, Dairy)</span>
                    <span className="font-bold">₹{calculatedFinancials.accountsPayableVendors.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-stone-700">
                    <span>Outstanding Staff Salaries Payable</span>
                    <span className="font-bold">₹{calculatedFinancials.payrollLiabilitiesPayable.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-stone-700">
                    <span>Unearned Customer Subscription Advances</span>
                    <span className="font-bold">₹{calculatedFinancials.unearnedSubscriptionAdvance.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-stone-700">
                    <span>Statutory Taxes Payable (GST & TDS)</span>
                    <span className="font-bold">₹{calculatedFinancials.gstAndTaxPayable.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-rose-950 font-extrabold pt-2 border-t border-stone-100 bg-stone-50 p-2 rounded-xl">
                    <span>TOTAL CURRENT LIABILITIES</span>
                    <span>₹{calculatedFinancials.totalCurrentLiabilities.toLocaleString()}</span>
                  </div>
                </div>

                {/* Non-Current Liabilities */}
                <div className="space-y-2 pt-2">
                  <h4 className="font-extrabold text-stone-900 uppercase text-[11px] border-b border-stone-100 pb-1">Non-Current Liabilities</h4>
                  <div className="flex justify-between text-stone-700">
                    <span>Bank Equipment Term Loan (HDFC)</span>
                    <span className="font-bold">₹{calculatedFinancials.longTermEquipmentLoan.toLocaleString()}</span>
                  </div>
                </div>

                {/* Owner's Equity */}
                <div className="space-y-2 pt-2">
                  <h4 className="font-extrabold text-stone-900 uppercase text-[11px] border-b border-stone-100 pb-1">Shareholders' Equity</h4>
                  <div className="flex justify-between text-stone-700">
                    <span>Paid-Up Share Capital</span>
                    <span className="font-bold">₹{calculatedFinancials.paidUpShareCapital.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-stone-700">
                    <span>Retained Earnings (Prior Periods)</span>
                    <span className="font-bold">₹{calculatedFinancials.retainedEarningsPrior.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-emerald-800 font-bold">
                    <span>Current Year Net Profit After Tax</span>
                    <span>₹{calculatedFinancials.currentYearProfit.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-emerald-950 font-extrabold pt-2 border-t border-stone-100 bg-emerald-50 p-2 rounded-xl">
                    <span>TOTAL SHAREHOLDERS' EQUITY</span>
                    <span>₹{calculatedFinancials.totalEquity.toLocaleString()}</span>
                  </div>
                </div>

              </div>

              <div className="bg-slate-950 text-white p-4 font-black text-sm flex justify-between items-center">
                <span>TOTAL LIABILITIES & EQUITY</span>
                <span className="text-amber-400 text-base">₹{calculatedFinancials.totalLiabilitiesAndEquity.toLocaleString()}</span>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* ==========================================
          SUB-TAB 4: CASH FLOW STATEMENT
         ========================================== */}
      {activeTab === 'cash-flow' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-stone-200 shadow-sm space-y-6">
          <div className="border-b border-stone-200 pb-4">
            <span className="text-[10px] font-black uppercase text-purple-900 bg-purple-100 px-2.5 py-0.5 rounded border border-purple-200">
              Cash Movement Breakdown
            </span>
            <h3 className="text-xl font-black text-stone-900 mt-1">Cash Flow Statement</h3>
            <p className="text-xs text-stone-500 mt-0.5">Operating, investing, and financing cash flows for July 2026.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-stone-100 text-stone-700 font-extrabold border-y border-stone-200">
                  <th className="py-3 px-4">Cash Flow Category</th>
                  <th className="py-3 px-4 text-right">Inflow / (Outflow) (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-medium text-stone-800">
                <tr className="bg-stone-50 font-bold">
                  <td className="py-2.5 px-4">I. CASH FLOW FROM OPERATING ACTIVITIES</td>
                  <td className="py-2.5 px-4 text-right"></td>
                </tr>
                <tr>
                  <td className="py-2 px-6">Net Profit After Tax</td>
                  <td className="py-2 px-4 text-right font-bold text-emerald-800">₹{calculatedFinancials.netProfit.toLocaleString()}</td>
                </tr>
                <tr>
                  <td className="py-2 px-6">Add: Non-Cash Depreciation Expense</td>
                  <td className="py-2 px-4 text-right font-bold">₹12,500</td>
                </tr>
                <tr>
                  <td className="py-2 px-6">Change in Working Capital (Receivables & Inventory)</td>
                  <td className="py-2 px-4 text-right font-bold text-rose-700">-₹22,000</td>
                </tr>
                <tr className="bg-emerald-100/70 font-black text-emerald-950">
                  <td className="py-2.5 px-4">NET CASH FROM OPERATING ACTIVITIES (A)</td>
                  <td className="py-2.5 px-4 text-right text-sm">₹{(calculatedFinancials.netProfit + 12500 - 22000).toLocaleString()}</td>
                </tr>

                <tr className="bg-stone-50 font-bold">
                  <td className="py-2.5 px-4">II. CASH FLOW FROM INVESTING ACTIVITIES</td>
                  <td className="py-2.5 px-4 text-right"></td>
                </tr>
                <tr>
                  <td className="py-2 px-6">Purchase of Kitchen Equipment & Stainless Steel Workstations</td>
                  <td className="py-2.5 px-4 text-right font-bold text-rose-700">-₹74,000</td>
                </tr>
                <tr className="bg-amber-100/70 font-black text-amber-950">
                  <td className="py-2.5 px-4">NET CASH USED IN INVESTING ACTIVITIES (B)</td>
                  <td className="py-2.5 px-4 text-right text-sm">-₹74,000</td>
                </tr>

                <tr className="bg-stone-50 font-bold">
                  <td className="py-2.5 px-4">III. CASH FLOW FROM FINANCING ACTIVITIES</td>
                  <td className="py-2.5 px-4 text-right"></td>
                </tr>
                <tr>
                  <td className="py-2 px-6">Repayment of Equipment Loan Principal</td>
                  <td className="py-2.5 px-4 text-right font-bold text-rose-700">-₹15,000</td>
                </tr>
                <tr className="bg-blue-100/70 font-black text-blue-950">
                  <td className="py-2.5 px-4">NET CASH USED IN FINANCING ACTIVITIES (C)</td>
                  <td className="py-2.5 px-4 text-right text-sm">-₹15,000</td>
                </tr>

                <tr className="bg-slate-900 text-white font-black text-sm">
                  <td className="py-3 px-4">NET INCREASE IN CASH & CASH EQUIVALENTS (A + B + C)</td>
                  <td className="py-3 px-4 text-right text-emerald-400">₹{(calculatedFinancials.netProfit + 12500 - 22000 - 74000 - 15000).toLocaleString()}</td>
                </tr>
                <tr className="bg-stone-100 font-bold text-stone-900">
                  <td className="py-2.5 px-4">Opening Cash & Bank Balance (01.07.2026)</td>
                  <td className="py-2.5 px-4 text-right">₹7,33,500</td>
                </tr>
                <tr className="bg-emerald-950 text-white font-black text-sm">
                  <td className="py-3.5 px-4">CLOSING CASH & BANK BALANCE (30.07.2026)</td>
                  <td className="py-3.5 px-4 text-right text-amber-400">₹{calculatedFinancials.cashAndBank.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==========================================
          SUB-TAB 5: COMPLETE TRANSACTIONS LEDGER
         ========================================== */}
      {activeTab === 'transactions' && (
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-6">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-100 pb-4">
            <div>
              <h3 className="text-lg font-black text-stone-900">Complete Financial Transactions Ledger</h3>
              <p className="text-xs text-stone-500">Log new transactions, view journal vouchers, counterparty details, and payment modes.</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('bank-statement')}
                className="bg-purple-900 hover:bg-purple-950 text-white font-extrabold px-4 py-2.5 rounded-2xl text-xs transition-all flex items-center gap-2 shadow-sm shrink-0"
              >
                <UploadCloud className="w-4 h-4 text-purple-300" />
                <span>AI Read Bank Statement</span>
              </button>

              <button
                onClick={() => setShowAddTxModal(true)}
                className="bg-slate-900 hover:bg-black text-white font-extrabold px-4 py-2.5 rounded-2xl text-xs transition-all flex items-center gap-2 shadow-sm shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Record Journal Transaction</span>
              </button>
            </div>
          </div>

          {/* Search & Type Filter Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={txSearchQuery}
                onChange={(e) => setTxSearchQuery(e.target.value)}
                placeholder="Search transaction, voucher or counterparty..."
                className="w-full bg-stone-50 border border-stone-200 rounded-2xl pl-10 pr-4 py-2 text-xs font-medium text-stone-800 focus:outline-none focus:ring-2 focus:ring-slate-500"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto scrollbar-none">
              {['All', 'Income', 'Expense', 'Asset Purchase', 'Tax / Statutory'].map((t) => (
                <button
                  key={t}
                  onClick={() => setTxTypeFilter(t)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap border transition-all ${
                    txTypeFilter === t
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Transactions Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-stone-100 text-stone-700 font-extrabold border-y border-stone-200">
                  <th className="py-3 px-4">Voucher & Date</th>
                  <th className="py-3 px-4">Type & Category</th>
                  <th className="py-3 px-4">Particulars & Counterparty</th>
                  <th className="py-3 px-4">Mode</th>
                  <th className="py-3 px-4 text-right">Debit (Dr)</th>
                  <th className="py-3 px-4 text-right">Credit (Cr)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredTransactions.map((tx) => {
                  const isCr = tx.accountType === 'Credit';

                  return (
                    <tr key={tx.id} className="hover:bg-stone-50/80 transition-all">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-extrabold text-stone-900 block">{tx.voucherNo}</span>
                        <span className="text-[10px] text-stone-400">{tx.date}</span>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded ${
                          tx.type === 'Income' ? 'bg-emerald-100 text-emerald-900' :
                          tx.type === 'Expense' ? 'bg-rose-100 text-rose-900' :
                          tx.type === 'Asset Purchase' ? 'bg-blue-100 text-blue-900' : 'bg-purple-100 text-purple-900'
                        }`}>
                          {tx.type}
                        </span>
                        <span className="text-xs text-stone-600 font-bold block mt-1">{tx.category}</span>
                      </td>

                      <td className="py-3 px-4">
                        <p className="font-bold text-stone-900">{tx.description}</p>
                        {tx.counterparty && (
                          <span className="text-[10px] text-stone-500 block">Party: {tx.counterparty}</span>
                        )}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap text-stone-600 font-medium">
                        {tx.paymentMode}
                      </td>

                      <td className="py-3 px-4 text-right font-black text-rose-700 whitespace-nowrap">
                        {!isCr ? `₹${tx.amount.toLocaleString()}` : '-'}
                      </td>

                      <td className="py-3 px-4 text-right font-black text-emerald-800 whitespace-nowrap">
                        {isCr ? `₹${tx.amount.toLocaleString()}` : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

        </div>
      )}

      {/* ==========================================
          SUB-TAB: AI MONTHLY BANK STATEMENT READER
         ========================================== */}
      {activeTab === 'bank-statement' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-stone-200 shadow-sm space-y-6">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-purple-900 bg-purple-100 px-2.5 py-0.5 rounded border border-purple-200">
                  AI Financial OCR & Reconciler
                </span>
                <span className="text-[10px] font-black uppercase text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                  Automated Ledger Posting
                </span>
              </div>
              <h3 className="text-xl font-black text-stone-900 mt-1 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-purple-700" />
                <span>Monthly Bank Statement Reader & Verification Engine</span>
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                Upload monthly bank statements (PDF, CSV, Excel, Image). The AI reads, categorizes, and extracts transaction lines. Review and modify any line before accepting into the official financial ledger.
              </p>
            </div>
          </div>

          {/* If successfully accepted */}
          {statementAcceptedSuccess ? (
            <div className="bg-emerald-50 border border-emerald-200 p-8 rounded-3xl text-center space-y-4 animate-fadeIn">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-800">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div className="max-w-md mx-auto space-y-2">
                <h4 className="text-xl font-black text-emerald-950">Bank Statement Transactions Posted!</h4>
                <p className="text-xs text-emerald-800 font-medium">
                  All verified bank transactions have been successfully recorded in the official Financial Ledger. Your Profit & Loss (P&L), Balance Sheet, and Turnover ratios are now automatically updated.
                </p>
              </div>
              <div className="flex justify-center gap-3 pt-2">
                <button
                  onClick={() => setActiveTab('transactions')}
                  className="bg-emerald-900 hover:bg-emerald-950 text-white font-extrabold px-5 py-2.5 rounded-2xl text-xs flex items-center gap-2 shadow-md transition-all"
                >
                  <Eye className="w-4 h-4" />
                  <span>View Updated Ledger ({transactions.length} Total Tx)</span>
                </button>
                <button
                  onClick={() => {
                    setStatementAcceptedSuccess(false);
                    setExtractedStatementRows([]);
                    setStatementFileName('');
                  }}
                  className="bg-white border border-emerald-300 text-emerald-900 hover:bg-emerald-100 font-bold px-4 py-2.5 rounded-2xl text-xs transition-all"
                >
                  Upload Another Bank Statement
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* UPLOAD & SAMPLE SELECTOR CARD */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Drag & Drop Upload Zone */}
                <div className="lg:col-span-7 bg-stone-50 border-2 border-dashed border-stone-300 rounded-3xl p-6 text-center space-y-4 hover:border-purple-400 transition-all flex flex-col items-center justify-center">
                  <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-800 flex items-center justify-center">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-stone-900">Upload Monthly Bank Statement</h4>
                    <p className="text-xs text-stone-500 mt-0.5">Drop PDF, CSV, Excel or scanned images here, or browse from computer</p>
                    <span className="text-[10px] text-stone-400 block mt-1">Supports HDFC, ICICI, SBI, Axis, Razorpay, PayU & Custom Bank Formats</span>
                  </div>

                  <div className="flex items-center justify-center gap-3">
                    <input
                      type="file"
                      id="bank-file-upload"
                      accept=".pdf,.csv,.xlsx,.xls,.png,.jpg,.jpeg"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleSimulateStatementScan(file.name);
                        }
                      }}
                    />
                    <label
                      htmlFor="bank-file-upload"
                      className="cursor-pointer bg-purple-900 hover:bg-purple-950 text-white font-extrabold px-5 py-2.5 rounded-2xl text-xs flex items-center gap-2 shadow-sm transition-all"
                    >
                      <UploadCloud className="w-4 h-4" />
                      <span>Browse Bank File</span>
                    </label>
                  </div>
                </div>

                {/* Pre-configured Demo Statement Presets */}
                <div className="lg:col-span-5 bg-purple-50/50 border border-purple-100 rounded-3xl p-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-purple-950 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-purple-700" />
                      <span>Instant AI Demo Presets</span>
                    </h4>
                    <span className="text-[10px] text-purple-700 font-bold">1-Click Test</span>
                  </div>
                  <p className="text-xs text-stone-600">
                    Test the AI Bank Reader immediately with sample monthly bank statements from cloud kitchen accounts:
                  </p>

                  <div className="space-y-2 pt-1">
                    {sampleBankStatements.map((sample, idx) => (
                      <button
                        key={idx}
                        disabled={isScanningStatement}
                        onClick={() => handleSimulateStatementScan(sample.fileName, sample.rows as any)}
                        className="w-full text-left p-3 rounded-2xl bg-white border border-purple-200 hover:border-purple-400 hover:shadow-xs transition-all flex items-center justify-between group"
                      >
                        <div className="space-y-0.5">
                          <div className="text-xs font-black text-stone-900 group-hover:text-purple-900">{sample.bankName}</div>
                          <span className="text-[10px] text-stone-400 block">{sample.fileName} • {sample.rows.length} Tx Lines</span>
                        </div>
                        <span className="text-[10px] font-extrabold bg-purple-100 text-purple-900 px-2.5 py-1 rounded-xl group-hover:bg-purple-900 group-hover:text-white transition-all">
                          Read Statement
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

              </div>

              {/* SCANNING LOADER STATE */}
              {isScanningStatement && (
                <div className="bg-purple-950 text-white p-8 rounded-3xl border border-purple-800 shadow-xl text-center space-y-4 animate-pulse">
                  <div className="w-14 h-14 bg-purple-900 rounded-full flex items-center justify-center mx-auto text-purple-300">
                    <Cpu className="w-8 h-8 animate-spin" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-base font-black text-purple-200">AI Reading & Processing Bank Statement...</h4>
                    <p className="text-xs text-purple-300 font-bold">{scanProgressStep}</p>
                  </div>
                  <div className="w-64 h-2 bg-purple-900 rounded-full mx-auto overflow-hidden">
                    <div className="h-full bg-purple-400 rounded-full animate-pulse w-3/4" />
                  </div>
                </div>
              )}

              {/* EXTRACTED TRANSACTION ROWS VERIFICATION & EDITING TABLE */}
              {!isScanningStatement && extractedStatementRows.length > 0 && (
                <div className="space-y-4 pt-2 animate-fadeIn">
                  
                  {/* Summary Toolbar */}
                  <div className="bg-stone-900 text-white p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-purple-900 rounded-xl text-purple-200">
                        <FileCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-white">Extracted Statement: {statementFileName}</span>
                          <span className="text-[10px] bg-emerald-900 text-emerald-300 font-extrabold px-2 py-0.5 rounded">
                            {extractedStatementRows.filter(r => r.selected).length} / {extractedStatementRows.length} Selected
                          </span>
                        </div>
                        <p className="text-[10px] text-stone-300 mt-0.5">
                          Check each entry below. If anything is wrong, edit the date, amount, category or description directly before accepting.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={handleAddBlankRowToStatement}
                        className="bg-stone-800 hover:bg-stone-700 text-white font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 border border-stone-700"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Row</span>
                      </button>
                      <button
                        onClick={handleAcceptAllStatementRows}
                        className="bg-emerald-500 hover:bg-emerald-600 text-stone-950 font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-md transition-all"
                      >
                        <Check className="w-4 h-4" />
                        <span>Accept & Post ({extractedStatementRows.filter(r => r.selected).length})</span>
                      </button>
                    </div>
                  </div>

                  {/* Verification Banner */}
                  <div className="bg-amber-50 border border-amber-200 p-3 rounded-2xl flex items-center gap-2 text-xs text-amber-900 font-medium">
                    <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>
                      <strong>Human Verification Layer:</strong> You have full control. Uncheck any duplicate row or edit incorrect values directly in the fields below before accepting into the ledger.
                    </span>
                  </div>

                  {/* Interactive Table */}
                  <div className="overflow-x-auto border border-stone-200 rounded-2xl">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-stone-100 text-stone-700 font-extrabold border-b border-stone-200">
                          <th className="py-3 px-3 text-center">
                            <button onClick={handleToggleAllRows} className="text-stone-600 hover:text-black">
                              {extractedStatementRows.every(r => r.selected) ? (
                                <CheckSquare className="w-4 h-4 text-purple-800" />
                              ) : (
                                <Square className="w-4 h-4 text-stone-400" />
                              )}
                            </button>
                          </th>
                          <th className="py-3 px-3">Date</th>
                          <th className="py-3 px-3">Type</th>
                          <th className="py-3 px-3">Category</th>
                          <th className="py-3 px-3">Particulars / Description</th>
                          <th className="py-3 px-3 text-right">Amount (₹)</th>
                          <th className="py-3 px-3">Payment Mode</th>
                          <th className="py-3 px-3">Ref / Voucher</th>
                          <th className="py-3 px-3">Counterparty</th>
                          <th className="py-3 px-3 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {extractedStatementRows.map((row) => (
                          <tr
                            key={row.tempId}
                            className={`transition-all ${
                              row.selected ? 'bg-white hover:bg-purple-50/30' : 'bg-stone-50/60 opacity-60'
                            }`}
                          >
                            {/* Selection Checkbox */}
                            <td className="py-2.5 px-3 text-center">
                              <button onClick={() => handleToggleRowSelection(row.tempId)}>
                                {row.selected ? (
                                  <CheckSquare className="w-4 h-4 text-purple-800" />
                                ) : (
                                  <Square className="w-4 h-4 text-stone-400" />
                                )}
                              </button>
                            </td>

                            {/* Date */}
                            <td className="py-2.5 px-3">
                              <input
                                type="date"
                                value={row.date}
                                onChange={(e) => handleUpdateExtractedRow(row.tempId, 'date', e.target.value)}
                                className="w-28 p-1 bg-stone-50 border border-stone-200 rounded text-xs font-bold text-stone-800 outline-none focus:border-purple-500"
                              />
                            </td>

                            {/* Type */}
                            <td className="py-2.5 px-3">
                              <select
                                value={row.type}
                                onChange={(e) => handleUpdateExtractedRow(row.tempId, 'type', e.target.value)}
                                className={`p-1 border rounded text-[10px] font-extrabold outline-none ${
                                  row.type === 'Income' ? 'bg-emerald-50 text-emerald-900 border-emerald-300' :
                                  row.type === 'Expense' ? 'bg-rose-50 text-rose-900 border-rose-300' :
                                  'bg-blue-50 text-blue-900 border-blue-300'
                                }`}
                              >
                                <option value="Income">Income</option>
                                <option value="Expense">Expense</option>
                                <option value="Asset Purchase">Asset Purchase</option>
                                <option value="Loan / Capital">Loan / Capital</option>
                                <option value="Tax / Statutory">Tax / Statutory</option>
                              </select>
                            </td>

                            {/* Category */}
                            <td className="py-2.5 px-3">
                              <input
                                type="text"
                                value={row.category}
                                onChange={(e) => handleUpdateExtractedRow(row.tempId, 'category', e.target.value)}
                                className="w-32 p-1 bg-stone-50 border border-stone-200 rounded text-xs font-bold text-stone-800 outline-none focus:border-purple-500"
                              />
                            </td>

                            {/* Description */}
                            <td className="py-2.5 px-3">
                              <input
                                type="text"
                                value={row.description}
                                onChange={(e) => handleUpdateExtractedRow(row.tempId, 'description', e.target.value)}
                                className="w-full min-w-[200px] p-1 bg-stone-50 border border-stone-200 rounded text-xs text-stone-900 font-medium outline-none focus:border-purple-500"
                              />
                            </td>

                            {/* Amount */}
                            <td className="py-2.5 px-3 text-right">
                              <input
                                type="number"
                                value={row.amount}
                                onChange={(e) => handleUpdateExtractedRow(row.tempId, 'amount', Number(e.target.value))}
                                className={`w-24 p-1 border rounded text-xs font-black text-right outline-none focus:border-purple-500 ${
                                  row.type === 'Income' ? 'text-emerald-800 bg-emerald-50/50 border-emerald-200' : 'text-rose-800 bg-rose-50/50 border-rose-200'
                                }`}
                              />
                            </td>

                            {/* Payment Mode */}
                            <td className="py-2.5 px-3">
                              <select
                                value={row.paymentMode}
                                onChange={(e) => handleUpdateExtractedRow(row.tempId, 'paymentMode', e.target.value)}
                                className="p-1 bg-stone-50 border border-stone-200 rounded text-[10px] font-bold text-stone-700 outline-none"
                              >
                                <option value="Bank Transfer / UPI">Bank Transfer / UPI</option>
                                <option value="Cheque / NEFT">Cheque / NEFT</option>
                                <option value="Credit Card">Credit Card</option>
                                <option value="Cash">Cash</option>
                              </select>
                            </td>

                            {/* Voucher No */}
                            <td className="py-2.5 px-3">
                              <input
                                type="text"
                                value={row.voucherNo}
                                onChange={(e) => handleUpdateExtractedRow(row.tempId, 'voucherNo', e.target.value)}
                                className="w-28 p-1 bg-stone-50 border border-stone-200 rounded text-[10px] font-mono font-bold text-stone-700 outline-none"
                              />
                            </td>

                            {/* Counterparty */}
                            <td className="py-2.5 px-3">
                              <input
                                type="text"
                                value={row.counterparty}
                                onChange={(e) => handleUpdateExtractedRow(row.tempId, 'counterparty', e.target.value)}
                                className="w-28 p-1 bg-stone-50 border border-stone-200 rounded text-xs font-bold text-stone-800 outline-none"
                              />
                            </td>

                            {/* Action */}
                            <td className="py-2.5 px-3 text-center">
                              <button
                                onClick={() => handleDeleteExtractedRow(row.tempId)}
                                className="text-stone-400 hover:text-rose-600 p-1"
                                title="Remove row"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Accept Bar */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-3 border-t border-stone-100">
                    <div className="text-xs text-stone-500">
                      <strong>Note:</strong> Unchecked rows will be discarded. Accepted rows will immediately update your general ledger, P&L, balance sheet, and turnover analytics.
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                      <button
                        onClick={() => {
                          setExtractedStatementRows([]);
                          setStatementFileName('');
                        }}
                        className="px-4 py-2.5 rounded-xl border border-stone-300 font-bold text-stone-600 text-xs hover:bg-stone-100 transition-all"
                      >
                        Cancel / Clear
                      </button>
                      <button
                        onClick={handleAcceptAllStatementRows}
                        className="bg-emerald-900 hover:bg-emerald-950 text-white font-black px-6 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-lg transition-all"
                      >
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span>Accept & Post All Verified Transactions ({extractedStatementRows.filter(r => r.selected).length})</span>
                      </button>
                    </div>
                  </div>

                </div>
              )}
            </>
          )}

        </div>
      )}

      {/* ==========================================
          SUB-TAB 6: PRINTABLE AUDIT STATEMENT
         ========================================== */}
      {activeTab === 'printable' && (
        <div className="bg-white p-8 rounded-3xl border border-stone-300 shadow-lg space-y-8 print:p-0 print:border-none print:shadow-none">
          
          <div className="flex justify-between items-start border-b-2 border-stone-900 pb-6">
            <div>
              <span className="text-xs font-black uppercase tracking-widest text-emerald-900 bg-emerald-100 px-3 py-1 rounded">
                PROTEIN BOWL CLOUD KITCHENS PRIVATE LIMITED
              </span>
              <h2 className="text-2xl font-black text-stone-900 mt-2">Executive Financial Audit & Performance Summary</h2>
              <p className="text-xs text-stone-600 mt-1">
                Registered Office: Door No. 12/450, MG Road, Ernakulam North, Kochi, Kerala 682018
              </p>
              <p className="text-xs text-stone-500">
                CIN: U55101KL2025PTC088210 • GSTIN: 32AABCP9912K1Z5 • PAN: AABCP9912K
              </p>
            </div>

            <button
              onClick={handlePrintFinancialReport}
              className="bg-emerald-800 hover:bg-emerald-900 text-white font-black px-5 py-2.5 rounded-2xl text-xs flex items-center gap-2 print:hidden shadow-md"
            >
              <Printer className="w-4 h-4" />
              <span>Print Financial Audit Statement</span>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-6 text-xs bg-stone-50 p-4 rounded-2xl border border-stone-200">
            <div>
              <span className="text-stone-400 font-bold uppercase block">Reporting Period</span>
              <strong className="text-stone-900 font-extrabold text-sm">01.07.2026 - 30.07.2026</strong>
            </div>
            <div>
              <span className="text-stone-400 font-bold uppercase block">Annual Business Turnover (ARR)</span>
              <strong className="text-emerald-800 font-extrabold text-sm">₹{(calculatedFinancials.annualizedTurnover / 100000).toFixed(2)} Lakhs</strong>
            </div>
            <div>
              <span className="text-stone-400 font-bold uppercase block">Net Operating Profit</span>
              <strong className="text-emerald-800 font-extrabold text-sm">₹{calculatedFinancials.netProfit.toLocaleString()} ({calculatedFinancials.netProfitMarginPct}%)</strong>
            </div>
          </div>

          {/* Quick Financial Summary */}
          <div className="space-y-4">
            <h3 className="text-base font-black text-stone-900 border-b border-stone-200 pb-2">Financial Performance Key Figures</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div className="p-3 border rounded-xl bg-stone-50">
                <span className="text-stone-500 block">Gross Revenue</span>
                <strong className="text-stone-900 text-base">₹{calculatedFinancials.grossRevenue.toLocaleString()}</strong>
              </div>
              <div className="p-3 border rounded-xl bg-stone-50">
                <span className="text-stone-500 block">Cost of Goods Sold</span>
                <strong className="text-rose-700 text-base">₹{calculatedFinancials.cogsTotal.toLocaleString()}</strong>
              </div>
              <div className="p-3 border rounded-xl bg-stone-50">
                <span className="text-stone-500 block">Operating Overheads</span>
                <strong className="text-rose-700 text-base">₹{calculatedFinancials.totalOpEx.toLocaleString()}</strong>
              </div>
              <div className="p-3 border rounded-xl bg-stone-50">
                <span className="text-stone-500 block">Net Profit After Tax</span>
                <strong className="text-emerald-800 text-base">₹{calculatedFinancials.netProfit.toLocaleString()}</strong>
              </div>
            </div>
          </div>

          {/* Signatures Footer */}
          <div className="pt-12 flex justify-between items-end border-t border-stone-200 text-xs">
            <div className="text-center space-y-8">
              <div className="w-48 border-b border-stone-400 mx-auto" />
              <p className="font-bold text-stone-800">Prepared by: Finance & Accounts Manager</p>
            </div>

            <div className="text-center space-y-8">
              <div className="w-48 border-b border-stone-400 mx-auto" />
              <p className="font-extrabold text-stone-900">Approved by: Managing Director (MD)</p>
            </div>
          </div>

        </div>
      )}

      {/* ==========================================
          MODAL: RECORD NEW JOURNAL TRANSACTION
         ========================================== */}
      {showAddTxModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-6 shadow-2xl border border-stone-200">
            
            <div className="flex items-center justify-between border-b border-stone-100 pb-4">
              <div>
                <span className="text-[10px] font-black uppercase text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                  Manual Journal Voucher
                </span>
                <h3 className="text-lg font-black text-stone-900 mt-1">Record Financial Transaction</h3>
              </div>
              <button onClick={() => setShowAddTxModal(false)} className="text-stone-400 hover:text-stone-600 font-bold text-lg">✕</button>
            </div>

            <form onSubmit={handleCreateTransaction} className="space-y-4 text-xs">
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-stone-600 block mb-1">Transaction Date</label>
                  <input
                    type="date"
                    required
                    value={newTxForm.date}
                    onChange={(e) => setNewTxForm({ ...newTxForm, date: e.target.value })}
                    className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl font-bold text-stone-800 outline-none"
                  />
                </div>

                <div>
                  <label className="font-bold text-stone-600 block mb-1">Transaction Type</label>
                  <select
                    value={newTxForm.type}
                    onChange={(e) => setNewTxForm({ ...newTxForm, type: e.target.value as any })}
                    className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl font-bold text-stone-800 outline-none"
                  >
                    <option value="Income">Income / Sales Revenue</option>
                    <option value="Expense">Operating Expense</option>
                    <option value="Asset Purchase">Capital Asset Purchase</option>
                    <option value="Loan / Capital">Loan / Capital Infusion</option>
                    <option value="Tax / Statutory">Tax / Statutory Payment</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-stone-600 block mb-1">Expense/Income Category</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Raw Material Sourcing"
                    value={newTxForm.category}
                    onChange={(e) => setNewTxForm({ ...newTxForm, category: e.target.value })}
                    className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl font-bold text-stone-800 outline-none"
                  />
                </div>

                <div>
                  <label className="font-bold text-stone-600 block mb-1">Amount (₹)</label>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 25000"
                    value={newTxForm.amount}
                    onChange={(e) => setNewTxForm({ ...newTxForm, amount: e.target.value })}
                    className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl font-bold text-stone-800 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-stone-600 block mb-1">Particulars / Description</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bulk purchase of organic vegetables from Palakkad"
                  value={newTxForm.description}
                  onChange={(e) => setNewTxForm({ ...newTxForm, description: e.target.value })}
                  className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl font-bold text-stone-800 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-stone-600 block mb-1">Counterparty / Vendor</label>
                  <input
                    type="text"
                    placeholder="e.g. Palakkad Farmer Group"
                    value={newTxForm.counterparty}
                    onChange={(e) => setNewTxForm({ ...newTxForm, counterparty: e.target.value })}
                    className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl font-bold text-stone-800 outline-none"
                  />
                </div>

                <div>
                  <label className="font-bold text-stone-600 block mb-1">Payment Mode</label>
                  <select
                    value={newTxForm.paymentMode}
                    onChange={(e) => setNewTxForm({ ...newTxForm, paymentMode: e.target.value as any })}
                    className="w-full p-2.5 bg-stone-50 border border-stone-300 rounded-xl font-bold text-stone-800 outline-none"
                  >
                    <option value="Bank Transfer / UPI">Bank Transfer / UPI</option>
                    <option value="Credit Card">Credit Card</option>
                    <option value="Cheque / NEFT">Cheque / NEFT</option>
                    <option value="Cash">Cash</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setShowAddTxModal(false)}
                  className="px-4 py-2.5 rounded-xl font-bold text-stone-600 hover:bg-stone-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-slate-900 hover:bg-black text-white font-extrabold px-5 py-2.5 rounded-xl shadow-md"
                >
                  Post Journal Voucher
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
};
