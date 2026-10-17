
import './App.css'

function App() {
  return (
    <main className="skybite">
      <nav className="navbar">
        <a className="brand" href="#home" aria-label="SkyBite home">
          <span className="brand-mark">S</span>
          <span>sky<span className="brand-accent">bite</span></span>
          <span className="brand-ai">AI</span>
        </a>

        <div className="nav-links">
          <a href="#how-it-works">How it works</a>
          <a href="#dietary-assistant">Dietary assistant</a>
        </div>

        <a className="nav-cta" href="#dietary-assistant">
          Personalise your meal <span aria-hidden="true">↗</span>
        </a>
      </nav>

      <section className="hero-section" id="home">
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />

        <div className="hero-copy">
          <div className="eyebrow">
            <span className="status-dot" />
            A NEW ERA OF IN-FLIGHT DINING
          </div>

          <h1>
            Your journey.
            <br />
            <span className="headline-muted">Your culture.</span>
            <br />
            <span className="headline-accent">Your meal.</span>
          </h1>

          <p className="hero-description">
            Thoughtful dining for every tradition, every preference,
            and every passenger. Meet a more personal way to fly.
          </p>

          <div className="hero-actions">
            <a className="primary-button" href="#dietary-assistant">
              Discover your meal <span aria-hidden="true">↗</span>
            </a>
            <a className="secondary-button" href="#how-it-works">
              Explore the experience <span aria-hidden="true">↓</span>
            </a>
          </div>

          <div className="hero-footnote">
            <span className="footnote-line" />
            DESIGNED AROUND YOU, AT 35,000 FT
          </div>
        </div>

        <div className="hero-visual" aria-label="SkyBite meal personalisation concept">
          <div className="orbit orbit-outer" />
          <div className="orbit orbit-inner" />

          <div className="visual-caption caption-top">
            <span className="caption-indicator" />
            PERSONALISATION ENGINE
          </div>

          <div className="meal-card">
            <div className="meal-card-top">
              <span>SKYBITE / 001</span>
              <span className="meal-card-icon">✳</span>
            </div>

            <div className="meal-illustration" aria-hidden="true">
              <div className="plate plate-outer">
                <div className="plate plate-inner">
                  <div className="food food-one" />
                  <div className="food food-two" />
                  <div className="food food-three" />
                  <div className="food food-four" />
                  <div className="garnish garnish-one" />
                  <div className="garnish garnish-two" />
                </div>
              </div>
            </div>

            <div className="meal-card-bottom">
              <div>
                <span className="meal-kicker">CRAFTED FOR YOUR JOURNEY</span>
                <h2>A meal that feels like yours.</h2>
              </div>
              <span className="meal-arrow" aria-hidden="true">↗</span>
            </div>
          </div>

          <div className="floating-note note-left">
            <span className="note-symbol">✳</span>
            <div>
              <span className="note-label">YOUR TRADITION</span>
              <strong>Respected.</strong>
            </div>
          </div>

          <div className="floating-note note-right">
            <span className="note-check">✓</span>
            <div>
              <span className="note-label">MEAL PREFERENCE</span>
              <strong>Made personal.</strong>
            </div>
          </div>

          <div className="visual-caption caption-bottom">
            <span>01</span>
            <span className="caption-divider" />
            A MORE HUMAN KIND OF HOSPITALITY
          </div>
        </div>

        <div className="hero-index" aria-hidden="true">
          <span>01</span>
          <span className="index-line" />
          <span>03</span>
        </div>
      </section>

      <section className="experience-section" id="how-it-works">
        <div className="section-heading">
          <span className="section-kicker">THE SKYBITE DIFFERENCE</span>
          <h2>
            The details matter.
            <br />
            <span>Especially yours.</span>
          </h2>
        </div>

        <div className="experience-grid">
          <article className="experience-card">
            <span className="card-number">01 / UNDERSTAND</span>
            <span className="experience-icon">◎</span>
            <h3>Your needs, understood.</h3>
            <p>
              Capture dietary preferences that go beyond standard meal codes,
              from Sattvik and strict Jain to fasting-related requirements.
            </p>
          </article>

          <article className="experience-card">
            <span className="card-number">02 / PERSONALISE</span>
            <span className="experience-icon">✳</span>
            <h3>Every passenger is different.</h3>
            <p>
              Give each traveller their own preference, even when a family
              shares the same booking.
            </p>
          </article>

          <article className="experience-card">
            <span className="card-number">03 / CONNECT</span>
            <span className="experience-icon">↗</span>
            <h3>One connected journey.</h3>
            <p>
              Bring passenger choices and crew meal information together
              in a clearer, more coordinated experience.
            </p>
          </article>
        </div>
      </section>

      <section className="assistant-section" id="dietary-assistant">
        <div className="assistant-copy">
          <span className="section-kicker">YOUR TABLE IN THE SKY</span>
          <h2>Let's find the meal that's right for you.</h2>
          <p>
            Your preferences deserve more than a generic meal code.
            The next step is a personal dietary assistant built around
            the way you travel.
          </p>
          <span className="assistant-status">
            <span className="status-dot" />
            PERSONALISATION EXPERIENCE
          </span>
        </div>

        <div className="assistant-preview">
          <div className="preview-top">
            <span>SKYBITE / MEAL STUDIO</span>
            <span className="preview-live">● CONCEPT PREVIEW</span>
          </div>
          <div className="preview-content">
            <span className="preview-number">01</span>
            <h3>What matters to your meal?</h3>
            <p>
              Dietary choices, cultural traditions, and personal needs
              all have a place at your table.
            </p>
            <button
              className="primary-button preview-button"
              type="button"
              onClick={() => {
                alert('Our interactive dietary assistant is the next feature we will build.')
              }}
            >
              Explore the next step <span aria-hidden="true">↗</span>
            </button>
          </div>
        </div>
      </section>

      <footer className="footer">
        <a className="brand footer-brand" href="#home">
          <span className="brand-mark">S</span>
          <span>sky<span className="brand-accent">bite</span></span>
          <span className="brand-ai">AI</span>
        </a>
        <span>Thoughtful dining. A more personal journey.</span>
        <a href="#home">BACK TO TOP ↑</a>
      </footer>
    </main>
  )
}

export default App
