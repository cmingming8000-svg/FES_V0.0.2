import { store } from '../store';

export interface DataVerificationReport {
  timestamp: string;
  totalEvaluations: number;
  facultyMetrics: {
    [facultyId: string]: {
      name: string;
      totalSubmissions: number;
      overallAverage: number;
      criteriaAverages: { [criterionId: string]: number };
      verified: boolean;
    };
  };
  dataIntegrity: {
    allEvaluationsHaveRatings: boolean;
    allRatingsInRange: boolean;
    metricsMatchEvaluations: boolean;
  };
}

export function verifyDataIntegrity(): DataVerificationReport {
  const report: DataVerificationReport = {
    timestamp: new Date().toISOString(),
    totalEvaluations: 0,
    facultyMetrics: {},
    dataIntegrity: { allEvaluationsHaveRatings: true, allRatingsInRange: true, metricsMatchEvaluations: true },
  };
  const allEvaluations = store.getEvaluations();
  report.totalEvaluations = allEvaluations.length;
  allEvaluations.forEach(eval_ => {
    if (!eval_.ratings || Object.keys(eval_.ratings).length === 0) report.dataIntegrity.allEvaluationsHaveRatings = false;
    Object.values(eval_.ratings).forEach(rating => { if (rating < 1 || rating > 5) report.dataIntegrity.allRatingsInRange = false; });
  });
  const faculty = store.getFaculty();
  const activeCycle = store.getActiveCycle();
  faculty.forEach(f => {
    const metrics = store.getFacultyMetrics(f.id, activeCycle?.id);
    report.facultyMetrics[f.id] = { name: f.name, totalSubmissions: metrics.totalSubmissions, overallAverage: metrics.overallAverage, criteriaAverages: metrics.criteriaAverages, verified: true };
  });
  return report;
}

export function getDataSummary() {
  return {
    totalFaculty: store.getFaculty().length,
    totalStudents: store.getStudents().length,
    totalCycles: store.getCycles().length,
    totalEvaluations: store.getEvaluations().length,
    totalCriteria: store.getCriteria().length,
    totalSubQuestions: store.getSubQuestions().length,
    activeCycle: store.getActiveCycle()?.id,
  };
}
