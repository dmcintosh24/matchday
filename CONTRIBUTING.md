# Contributing to Matchday

Thanks for your interest in contributing! Here's how to get involved.

## Reporting Bugs

1. Check the [existing issues](https://github.com/dmcintosh24/matchday/issues) to avoid duplicates
2. Open a new issue with:
   - What you expected to happen
   - What actually happened
   - Steps to reproduce
   - Browser/device info
   - Screenshots if applicable

## Suggesting Features

Open an issue with the `enhancement` label describing:
- What problem it solves
- How you envision it working
- Any mockups or examples

## Pull Requests

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Test locally (see Development Setup below)
5. Commit with clear messages
6. Push and open a PR against `main`

### Development Setup

```bash
# Clone
git clone https://github.com/dmcintosh24/matchday.git
cd matchday

# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
SECRET_KEY=dev-secret uvicorn main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

The frontend dev server proxies `/api` to the backend on port 8000.

### Code Style

- **Python:** Follow PEP 8. Keep functions focused and readable.
- **React:** Functional components with hooks. Keep pages self-contained.
- **CSS:** Use CSS variables from `index.css`. No CSS-in-JS libraries.

### What We're Looking For

- Bug fixes
- Performance improvements
- Accessibility improvements
- Mobile UX improvements
- New league features (open an issue first to discuss)
- Documentation improvements
- Tests (we don't have many yet — this is a great area to contribute)

## Code of Conduct

Be kind, be constructive, be welcoming. We're all here because we love football and building things.
