// Re-export from the refactored per-template PDF generators.
// The old generateClinicalPDF (physio-only) is now generatePhysioPDF.
export { generatePhysioPDF as generateClinicalPDF, type PhysioPDFData as ClinicalRecordData } from "./pdf/physio";
export { generatePhysicianPDF, type PhysicianPDFData } from "./pdf/physician";
export { generateCounsellingPDF, type CounsellingPDFData } from "./pdf/counselling";
export { generateYogaPDF, type YogaPDFData } from "./pdf/yoga";
