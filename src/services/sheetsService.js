import { google } from 'googleapis';

export default class SheetsService {
  constructor({ spreadsheetId, logger, sheets, auth } = {}) {
    this.spreadsheetId = spreadsheetId;
    this.logger = logger;

    if (sheets) {
      this.sheets = sheets;
    } else if (auth) {
      this.sheets = google.sheets({ version: 'v4', auth });
    }
  }

  async exportResults(leads, drafts, weekLabel) {
    // Tab 1: Weekly Leads
    const weeklyRows = leads.map((lead, i) =>
      this.buildWeeklyLeadsRow(lead, i + 1, leads.length, weekLabel)
    );
    await this.appendRows('Weekly Leads!A:N', weeklyRows);

    // Tab 2: Outreach Drafts
    const draftRows = leads.map((lead, i) =>
      this.buildDraftsRow(lead.business_name, drafts[i])
    );
    await this.appendRows('Outreach Drafts!A:G', draftRows);

    // Tab 3: History
    const historyRows = leads.map(lead => this.buildHistoryRow(lead));
    await this.appendRows('History!A:E', historyRows);

    this.logger?.info(`Exported ${leads.length} leads to Google Sheets.`);
  }

  buildWeeklyLeadsRow(lead, rank, total, weekLabel) {
    return [
      weekLabel,
      `${rank} of ${total}`,
      lead.business_name,
      lead.type || '',
      lead.formatted_address || '',
      lead.distance_km ?? '',
      lead.phone || '',
      lead.email || '',
      lead.website || '',
      lead.instagram || '',
      lead.facebook || '',
      lead.total_score ?? '',
      lead.reasoning || '',
      'pending'
    ];
  }

  buildDraftsRow(businessName, drafts) {
    if (drafts?.error) {
      return [businessName, 'Error', 'Error', 'Error', 'Error', 'Error', 'Error'];
    }
    return [
      businessName,
      `Subject: ${drafts.curious_neighbor.email_subject}\n\n${drafts.curious_neighbor.email_body}`,
      `Subject: ${drafts.value_lead.email_subject}\n\n${drafts.value_lead.email_body}`,
      `Subject: ${drafts.compliment_question.email_subject}\n\n${drafts.compliment_question.email_body}`,
      drafts.curious_neighbor.dm,
      drafts.value_lead.dm,
      drafts.compliment_question.dm
    ];
  }

  buildHistoryRow(lead) {
    return [
      lead.business_name,
      new Date().toISOString().split('T')[0],
      lead.total_score ?? '',
      'pending',
      ''
    ];
  }

  async appendRows(range, rows) {
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows }
    });
  }

  async exportToCSV(leads, drafts, filePath) {
    const { default: fs } = await import('node:fs/promises');
    const lines = ['business_name,type,address,phone,email,website,score,reasoning'];

    for (const lead of leads) {
      const row = [
        lead.business_name, lead.type, lead.formatted_address,
        lead.phone, lead.email, lead.website,
        lead.total_score, lead.reasoning
      ].map(v => `"${(v || '').toString().replace(/"/g, '""')}"`);
      lines.push(row.join(','));
    }

    await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
    return filePath;
  }
}
