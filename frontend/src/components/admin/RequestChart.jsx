import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export default function RequestChart({ data }) {
  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#b99a62" stopOpacity={0.24} />
              <stop offset="100%" stopColor="#b99a62" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#edf0f2" />
          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#9299a1', fontSize: 11 }} />
          <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#9299a1', fontSize: 11 }} />
          <Tooltip />
          <Area type="monotone" dataKey="count" stroke="#b99a62" strokeWidth={2.5} fill="url(#chartFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
