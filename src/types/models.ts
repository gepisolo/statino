// Firestore document shapes. All documents live under `users/{uid}/…` —
// the app is single-user, rules only allow the owner.

export interface Client {
  id: string;
  name: string;
}

export interface Project {
  id: string;
  clientId: string;
  name: string;
}

// One contract per (client, activity): the same client can pay different
// hourly rates for different activities. `annualHours` is the yearly
// allowance, counted over the calendar year.
export interface Contract {
  id: string;
  clientId: string;
  activity: string;
  startDate: string; // YYYY-MM-DD inclusive
  endDate: string; // YYYY-MM-DD inclusive
  annualHours: number;
  hourlyRate: number;
}

// A single activity row inside a day. The day's total hours are the sum
// of its entries. `date` is the calendar day the work happened.
export interface Entry {
  id: string;
  date: string; // YYYY-MM-DD
  clientId: string;
  contractId: string;
  projectId: string | null;
  ticket: string;
  link: string;
  description: string;
  hours: number;
}
