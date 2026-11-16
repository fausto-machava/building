export default function StageCaption({ stage, index, total, progress }) {
  if (!stage) return null

  return (
    <div key={index} className="image-demo-caption" aria-live="polite">
      <span className="image-demo-kicker">DEMONSTRAÇÃO DE IMAGENS</span>
      <h2><span>{stage.lead}</span> <em>{stage.accent}</em></h2>
      <p>{stage.description}</p>
      <div
        className="image-demo-progress"
        role="progressbar"
        aria-label={`Etapa ${index + 1} de ${total}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        <span className="image-demo-progress-mark" aria-hidden="true" />
        <span className="image-demo-progress-track" aria-hidden="true"><span style={{ transform: `scaleX(${progress})` }} /></span>
        <span>Etapa {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}</span>
      </div>
    </div>
  )
}
