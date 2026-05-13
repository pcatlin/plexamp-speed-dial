export default function CreditsPage() {
  return (
    <div className="appShell creditsShell">
      <main className="creditsPage card">
        <p className="creditsBack">
          <a href="#/">← Back to app</a>
        </p>
        <h1 className="creditsTitle">Credits</h1>
        <p className="creditsLead">Third-party libraries and assets used by Plexamp Sonos Speed Dial.</p>

        <section className="creditsSection">
          <h2>Icon</h2>
          <p>
            <a
              href="https://www.flaticon.com/free-icons/google-play-music"
              title="google play music icons"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google play music icons created by IYAHICON - Flaticon
            </a>
          </p>
        </section>

        <section className="creditsSection">
          <h2>Media and devices</h2>
          <ul className="creditsList">
            <li>
              <a href="https://github.com/pkkid/python-plexapi" target="_blank" rel="noopener noreferrer">
                python-plexapi
              </a>{" "}
              — Plex Media Server and Plex.tv APIs
            </li>
            <li>
              <a href="https://www.plex.tv/" target="_blank" rel="noopener noreferrer">
                Plex
              </a>{" "}
              and Plexamp are trademarks of Plex
            </li>
            <li>
              <a href="https://github.com/SoCo/SoCo" target="_blank" rel="noopener noreferrer">
                SoCo
              </a>{" "}
              — Sonos control (Python)
            </li>
          </ul>
        </section>

        <section className="creditsSection">
          <h2>Application stack</h2>
          <ul className="creditsList">
            <li>
              <a href="https://react.dev/" target="_blank" rel="noopener noreferrer">
                React
              </a>
              ,{" "}
              <a href="https://www.typescriptlang.org/" target="_blank" rel="noopener noreferrer">
                TypeScript
              </a>
              ,{" "}
              <a href="https://vitejs.dev/" target="_blank" rel="noopener noreferrer">
                Vite
              </a>{" "}
              (frontend)
            </li>
            <li>
              <a href="https://fastapi.tiangolo.com/" target="_blank" rel="noopener noreferrer">
                FastAPI
              </a>
              ,{" "}
              <a href="https://www.uvicorn.org/" target="_blank" rel="noopener noreferrer">
                Uvicorn
              </a>
              ,{" "}
              <a href="https://www.python.org/" target="_blank" rel="noopener noreferrer">
                Python
              </a>
              ,{" "}
              <a href="https://requests.readthedocs.io/" target="_blank" rel="noopener noreferrer">
                Requests
              </a>{" "}
              (API)
            </li>
            <li>
              <a href="https://www.sqlalchemy.org/" target="_blank" rel="noopener noreferrer">
                SQLAlchemy
              </a>
              ,{" "}
              <a href="https://www.postgresql.org/" target="_blank" rel="noopener noreferrer">
                PostgreSQL
              </a>{" "}
              (data)
            </li>
            <li>
              <a href="https://www.docker.com/" target="_blank" rel="noopener noreferrer">
                Docker
              </a>
              ,{" "}
              <a href="https://nginx.org/" target="_blank" rel="noopener noreferrer">
                nginx
              </a>{" "}
              (deployment)
            </li>
          </ul>
        </section>

        <section className="creditsSection creditsSectionDim">
          <h2>Development</h2>
          <p className="creditsDim">
            Parts of this project were built with{" "}
            <a href="https://cursor.com/" target="_blank" rel="noopener noreferrer">
              Cursor
            </a>
            , the AI-native editor from Anysphere.
          </p>
        </section>
      </main>
    </div>
  );
}
