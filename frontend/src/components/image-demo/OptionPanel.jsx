export default function OptionPanel({
  scene,
  activeOptionId,
  activeHardwareId,
  onSelectOption,
  onSelectHardware,
  visible,
}) {
  return (
    <div className={`image-demo-options${visible ? ' is-visible' : ''}`} aria-label={`${scene.title} opções`}>
      <div className="image-demo-options-heading">
        <span>ESCOLHA OS ACABAMENTOS</span>
        <strong>{scene.title}</strong>
      </div>
      <div className="image-demo-option-list" role="group" aria-label="Escolher acabamento">
        {scene.options.map((option, index) => (
          <button
            type="button"
            key={option.id}
            className={`image-demo-option${option.id === activeOptionId ? ' is-active' : ''}`}
            style={{ '--option-index': index }}
            onClick={() => onSelectOption(option)}
            aria-pressed={option.id === activeOptionId}
          >
            {option.swatch
              ? <span className="image-demo-swatch" style={{ backgroundColor: option.swatch }} aria-hidden="true" />
              : <span className="image-demo-option-icon" aria-hidden="true">{option.icon}</span>}
            <span>{option.label}</span>
          </button>
        ))}
      </div>
      {scene.hardwareOptions?.length > 0 && (
        <div className="image-demo-hardware">
          <span>Ferragens</span>
          <div role="group" aria-label="Escolher acabamento das ferragens">
            {scene.hardwareOptions.map(option => (
              <button
                type="button"
                key={option.id}
                className={`image-demo-hardware-option${option.id === activeHardwareId ? ' is-active' : ''}`}
                onClick={() => onSelectHardware(option.id)}
                aria-pressed={option.id === activeHardwareId}
              >
                <span className="image-demo-swatch" style={{ backgroundColor: option.swatch }} aria-hidden="true" />
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
