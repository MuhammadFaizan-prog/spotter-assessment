import { RISK, THRESHOLDS } from '../lib/risk'

export default function Legend() {
  return (
    <details className="legend" open={typeof window === 'undefined' || window.innerWidth > 900}>
      <summary>Risk scale</summary>
      <table>
        <thead>
          <tr>
            <th scope="col">Level</th>
            <th scope="col">Wind</th>
            <th scope="col">Rain</th>
            <th scope="col">Snow</th>
          </tr>
        </thead>
        <tbody>
          {RISK.map((r, i) => (
            <tr key={r.level}>
              <th scope="row">
                <span className={`legend__sw ${i === 4 ? 'riskbar__hatch' : ''}`} style={{ background: r.color }} aria-hidden />
                {r.label}
              </th>
              <td className="mono">{THRESHOLDS.wind[i]}</td>
              <td className="mono">{THRESHOLDS.rain[i]}</td>
              <td className="mono">{THRESHOLDS.snow[i]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="legend__note">Dashed grey = alternative routes. Coloured line = selected route by checkpoint risk. White dots = truck position at the slider time.</p>
    </details>
  )
}
