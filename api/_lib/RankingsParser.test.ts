import { describe, expect, it } from 'vitest';
import { parseRankings } from './shared.js';

describe('parseRankings', () => {
  it('parses ranking rows and decodes HTML entities', () => {
    const html = `
      <table>
        <tbody>
          <tr>
            <td>1</td>
            <td>1001</td>
            <td>Li, Alice &amp; Bob</td>
            <td>12,345</td>
          </tr>
          <tr>
            <td>2</td>
            <td>1002</td>
            <td>Chen, Chris</td>
            <td>9876</td>
          </tr>
        </tbody>
      </table>
    `;

    const parsed = parseRankings(html, 'U13', 'BS');
    expect(parsed).toEqual([
      {
        usabId: '1001',
        name: 'Li, Alice & Bob',
        rank: 1,
        rankingPoints: 12345,
        ageGroup: 'U13',
        eventType: 'BS',
      },
      {
        usabId: '1002',
        name: 'Chen, Chris',
        rank: 2,
        rankingPoints: 9876,
        ageGroup: 'U13',
        eventType: 'BS',
      },
    ]);
  });

  it('skips malformed rows', () => {
    const html = `
      <table>
        <tbody>
          <tr><td>0</td><td></td><td>Invalid</td><td>100</td></tr>
          <tr><td>1</td><td>2001</td><td>Valid Player</td><td>100</td></tr>
        </tbody>
      </table>
    `;
    const parsed = parseRankings(html, 'U11', 'GS');
    expect(parsed).toHaveLength(1);
    expect(parsed[0].usabId).toBe('2001');
  });
});
