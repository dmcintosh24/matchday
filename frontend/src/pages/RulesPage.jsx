import { useState, useEffect } from 'react';
import { api } from '../api/client';

export default function RulesPage() {
  const [config, setConfig] = useState({});
  const [teamCount, setTeamCount] = useState(0);
  useEffect(() => {
    api.get('/config').then(setConfig).catch(() => {});
    api.get('/teams').then(d => setTeamCount(d.teams?.length || 0)).catch(() => {});
  }, []);

  const val = (key) => config[key]?.value || '—';
  const numVal = (key) => parseFloat(config[key]?.value || '0');

  const entryFee = numVal('payout_entry_fee');
  const weeklyPrize = numVal('payout_weekly_prize');
  const totalPot = entryFee * teamCount;
  const weeklyTotal = weeklyPrize * 38;
  const seasonPool = Math.max(0, totalPot - weeklyTotal);

  return (
    <div>
      <h1>League Rules & Scoring</h1>

      {/* Roster Rules */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>Roster Rules</h2>
        <table>
          <tbody>
            <tr><td style={{ fontWeight: 600 }}>Salary Cap</td><td>£{val('salary_cap')}m</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Squad Size</td><td>{val('squad_size')} players</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Goalkeepers</td><td>{val('max_gk')}</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Defenders</td><td>{val('max_def')}</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Midfielders</td><td>{val('max_mid')}</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Forwards</td><td>{val('max_fwd')}</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Max Per Club</td><td>{val('max_per_club')} players from any one PL club</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Draft Type</td><td style={{ textTransform: 'capitalize' }}>{val('draft_type')}</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Trade Review</td><td>{val('trade_review_period_hours')} hours</td></tr>
          </tbody>
        </table>
      </div>

      {/* Starting XI Rules */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>Starting XI Formations</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
          Your starting lineup must include 1 GK plus at least {val('min_starting_def')} DEF, {val('min_starting_mid')} MID, and {val('min_starting_fwd')} FWD.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {['3-4-3', '3-5-2', '4-3-3', '4-4-2', '4-5-1', '5-3-2', '5-4-1'].map(f => (
            <span key={f} style={{
              padding: '0.35rem 0.75rem', background: 'var(--bg-input)', borderRadius: 'var(--radius)',
              fontSize: '0.85rem', fontWeight: 600, fontFamily: 'var(--font-display)',
            }}>{f}</span>
          ))}
        </div>
      </div>

      {/* Scoring */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>Points Scoring</h2>

        <h3 style={{ marginTop: '1rem' }}>Goals</h3>
        <table>
          <thead><tr><th>Position</th><th>Points per Goal</th></tr></thead>
          <tbody>
            <tr><td><span className="pos pos-GK">GK</span> Goalkeeper</td><td style={{ fontWeight: 700 }}>{val('pts_goal_gk')} pts</td></tr>
            <tr><td><span className="pos pos-DEF">DEF</span> Defender</td><td style={{ fontWeight: 700 }}>{val('pts_goal_def')} pts</td></tr>
            <tr><td><span className="pos pos-MID">MID</span> Midfielder</td><td style={{ fontWeight: 700 }}>{val('pts_goal_mid')} pts</td></tr>
            <tr><td><span className="pos pos-FWD">FWD</span> Forward</td><td style={{ fontWeight: 700 }}>{val('pts_goal_fwd')} pts</td></tr>
          </tbody>
        </table>

        <h3 style={{ marginTop: '1.5rem' }}>Assists</h3>
        <table>
          <tbody>
            <tr><td>All positions</td><td style={{ fontWeight: 700 }}>{val('pts_assist')} pts per assist</td></tr>
          </tbody>
        </table>

        <h3 style={{ marginTop: '1.5rem' }}>Clean Sheets</h3>
        <table>
          <thead><tr><th>Position</th><th>Points</th></tr></thead>
          <tbody>
            <tr><td><span className="pos pos-GK">GK</span> Goalkeeper</td><td style={{ fontWeight: 700 }}>{val('pts_clean_sheet_gk')} pts</td></tr>
            <tr><td><span className="pos pos-DEF">DEF</span> Defender</td><td style={{ fontWeight: 700 }}>{val('pts_clean_sheet_def')} pts</td></tr>
            <tr><td><span className="pos pos-MID">MID</span> Midfielder</td><td style={{ fontWeight: 700 }}>{val('pts_clean_sheet_mid')} pts</td></tr>
          </tbody>
        </table>

        <h3 style={{ marginTop: '1.5rem' }}>Goalkeeping</h3>
        <table>
          <tbody>
            <tr><td>Every {val('pts_save_per_3') === '1' ? '3' : '3'} saves</td><td style={{ fontWeight: 700 }}>{val('pts_save_per_3')} pt</td></tr>
            <tr><td>Penalty save</td><td style={{ fontWeight: 700 }}>{val('pts_penalty_save')} pts</td></tr>
          </tbody>
        </table>

        <h3 style={{ marginTop: '1.5rem' }}>Defensive Contributions</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
          Points awarded for combined clearances, blocks, interceptions, tackles (and ball recoveries for MID/FWD).
        </p>
        <table>
          <tbody>
            <tr><td><span className="pos pos-DEF">DEF</span> {val('def_contrib_threshold_def')} actions</td><td style={{ fontWeight: 700 }}>{val('pts_defensive_contrib')} pts</td></tr>
            <tr><td><span className="pos pos-MID">MID</span> <span className="pos pos-FWD">FWD</span> {val('def_contrib_threshold_mid_fwd')} actions</td><td style={{ fontWeight: 700 }}>{val('pts_defensive_contrib')} pts</td></tr>
          </tbody>
        </table>

        <h3 style={{ marginTop: '1.5rem' }}>Bonus Points (BPS)</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
          The top 3 scoring players in each match by the Bonus Points System receive extra points.
        </p>
        <table>
          <tbody>
            <tr><td>1st place BPS</td><td style={{ fontWeight: 700 }}>{val('pts_bonus_1st')} pts</td></tr>
            <tr><td>2nd place BPS</td><td style={{ fontWeight: 700 }}>{val('pts_bonus_2nd')} pts</td></tr>
            <tr><td>3rd place BPS</td><td style={{ fontWeight: 700 }}>{val('pts_bonus_3rd')} pts</td></tr>
          </tbody>
        </table>
      </div>

      {/* Trade Rules */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>Trade Rules</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
          All trades go through a league review process to ensure fairness.
        </p>

        <h3>How Trades Work</h3>
        <table>
          <tbody>
            <tr>
              <td style={{ fontWeight: 600, width: '40%' }}>Step 1: Proposal</td>
              <td>Either manager proposes a trade, selecting players from both rosters.</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 600 }}>Step 2: Acceptance</td>
              <td>The receiving manager reviews the trade and accepts or rejects it.</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 600 }}>Step 3: League Review</td>
              <td>Once accepted, the trade enters a {val('trade_review_period_hours')}-hour review period visible to all managers.</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 600 }}>Step 4: Protest Window</td>
              <td>Any manager not involved in the trade can file a protest during the review period.</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 600 }}>Step 5: Resolution</td>
              <td>If protests reach the threshold, the trade is vetoed. Otherwise, it completes automatically when the review period ends.</td>
            </tr>
          </tbody>
        </table>

        <h3 style={{ marginTop: '1.5rem' }}>Trade Settings</h3>
        <table>
          <tbody>
            <tr>
              <td style={{ fontWeight: 600 }}>Review Period</td>
              <td>{val('trade_review_period_hours')} hours after acceptance</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 600 }}>Protest Threshold</td>
              <td>{val('trade_protest_threshold')}% of uninvolved managers must protest to veto</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 600 }}>Roster Validation</td>
              <td>Both teams must remain within salary cap and position limits after the trade</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Free Agency & Lineup Lock */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>Free Agency</h2>
        {val('free_agency_enabled') === '1' ? (
          <>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
              Player pickups are restricted to a weekly free agency window. Outside this window, you cannot add free agents to your roster.
            </p>
            <table>
              <tbody>
                <tr><td style={{ fontWeight: 600 }}>Window</td><td>{['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][parseInt(val('free_agency_day_start'))] || '—'} through {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][parseInt(val('free_agency_day_end'))] || '—'}</td></tr>
                <tr><td style={{ fontWeight: 600 }}>Hours</td><td>{val('free_agency_hour_start')}:00 — {val('free_agency_hour_end')}:00 ET</td></tr>
              </tbody>
            </table>
          </>
        ) : (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Free agency is currently unrestricted — players can be added at any time.
          </p>
        )}

        <h3 style={{ marginTop: '1.5rem' }}>Lineup Deadline</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          {val('lineup_lock_enabled') === '1'
            ? 'Lineups lock at each gameweek\'s official deadline. Once locked, your starting XI cannot be changed for that gameweek. If you don\'t set a lineup, your most recent one carries forward automatically.'
            : 'Lineup lock is currently disabled — lineups can be changed at any time.'}
        </p>
      </div>

      {/* Payouts */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>Payouts</h2>
        {entryFee > 0 ? (
          <>
            <table>
              <tbody>
                <tr><td style={{ fontWeight: 600 }}>Entry Fee</td><td>${entryFee} per manager</td></tr>
                <tr><td style={{ fontWeight: 600 }}>Managers</td><td>{teamCount}</td></tr>
                <tr><td style={{ fontWeight: 600 }}>Total Pot</td><td style={{ fontWeight: 700, color: 'var(--accent)' }}>${totalPot}</td></tr>
              </tbody>
            </table>

            <h3 style={{ marginTop: '1.5rem' }}>Weekly High Score</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
              The highest-scoring team each gameweek wins the weekly prize. This keeps everyone engaged all season.
            </p>
            <table>
              <tbody>
                <tr><td style={{ fontWeight: 600 }}>Weekly Prize</td><td>${weeklyPrize} per gameweek</td></tr>
                <tr><td style={{ fontWeight: 600 }}>Total Weekly (38 GWs)</td><td>${weeklyTotal}</td></tr>
              </tbody>
            </table>

            <h3 style={{ marginTop: '1.5rem' }}>Season Finish Prizes</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
              Remaining pot after weekly prizes: <strong>${seasonPool.toFixed(0)}</strong>
            </p>
            <table>
              <thead><tr><th>Place</th><th>Percentage</th><th>Payout</th></tr></thead>
              <tbody>
                <tr>
                  <td style={{ fontWeight: 600 }}>🥇 1st Place</td>
                  <td>{val('payout_1st_pct')}%</td>
                  <td style={{ fontWeight: 700, color: 'var(--accent)' }}>${(seasonPool * numVal('payout_1st_pct') / 100).toFixed(0)}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600 }}>🥈 2nd Place</td>
                  <td>{val('payout_2nd_pct')}%</td>
                  <td style={{ fontWeight: 700 }}>${(seasonPool * numVal('payout_2nd_pct') / 100).toFixed(0)}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600 }}>🥉 3rd Place</td>
                  <td>{val('payout_3rd_pct')}%</td>
                  <td style={{ fontWeight: 700 }}>${(seasonPool * numVal('payout_3rd_pct') / 100).toFixed(0)}</td>
                </tr>
              </tbody>
            </table>
            <h3 style={{ marginTop: '1.5rem' }}>How to Pay</h3>
            <table>
              <tbody>
                <tr>
                  <td style={{ fontWeight: 600 }}>Venmo</td>
                  <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{val('payout_venmo')}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600 }}>PayPal</td>
                  <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{val('payout_paypal')}</td>
                </tr>
              </tbody>
            </table>
          </>
        ) : (
          <div style={{
            padding: '2rem', textAlign: 'center', color: 'var(--text-muted)',
            background: 'var(--bg-input)', borderRadius: 'var(--radius)',
          }}>
            <p style={{ fontSize: '1.1rem', fontFamily: 'var(--font-display)', fontWeight: 600, marginBottom: '0.5rem' }}>
              Coming Soon
            </p>
            <p style={{ fontSize: '0.85rem' }}>
              Payout structure will be announced before the season kicks off.
            </p>
          </div>
        )}
      </div>

      {/* Season Info */}
      <div className="card">
        <h2>Season</h2>
        <table>
          <tbody>
            <tr><td style={{ fontWeight: 600 }}>Season</td><td>{val('season_name')}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
