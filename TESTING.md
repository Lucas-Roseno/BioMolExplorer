# 🧬 BioMolExplorer Testing Guide

## ✅ Phase 1: API Testing - COMPLETE
- ✅ Jest + Supertest configured
- ✅ 17 tests covering endpoints, file handling, security
- ✅ All tests passing

## ✅ Phase 2: Web Testing - COMPLETE
- ✅ Jest + React Testing Library configured
- ✅ 30 tests covering pages, components, hooks, integration
- ✅ All tests passing

### Web Test Coverage

**📄 Pages (12 tests)**
- `__tests__/pages/home.test.tsx` - Home page rendering
- `__tests__/pages/pdb.test.tsx` - PDB search form and file browser
- `__tests__/pages/chembl.test.tsx` - ChEMBL bioactivity interface
- `__tests__/pages/analysis.test.tsx` - Network visualization and controls

**🎨 Components (5 tests)**
- `__tests__/components/LoadingOverlay.test.tsx` - Loading states and accessibility

**🪝 Hooks (3 tests)**
- `__tests__/hooks/useFiles.test.ts` - File fetching hook with error handling

**🔗 Integration (10 tests)**
- `__tests__/integration/api-integration.test.tsx` - Web + API contract validation
  - API response structure validation
  - Error handling
  - Network failure resilience

---

## Running Tests

### API Tests
```bash
cd apps/api
npm test              # Run once
npm run test:watch   # Watch mode
npm run test:coverage # Coverage report
```

### Web Tests
```bash
cd apps/web
npm test              # Run once
npm run test:watch   # Watch mode
npm run test:coverage # Coverage report
```

### All Tests Together
```bash
cd apps
npm run test:api
npm run test:web
```

---

## 📊 Test Summary

| Layer | Suites | Tests | Status |
|-------|--------|-------|--------|
| **API** | 2 | 17 | ✅ Passing |
| **Web** | 7 | 30 | ✅ Passing |
| **Python** | - | - | ⏳ Next |
| **E2E** | - | - | ⏳ Future |
| **TOTAL** | 9 | 47 | ✅ 47/47 |

---

## 🐍 Phase 3: Python Testing (Next Steps)

Setup pytest for Flask endpoints:

```bash
cd apps/python-service
pip install pytest pytest-cov

# Run tests
pytest
pytest --cov=BioMolExplorer
```

Test coverage:
- Data crawler validation (PDB, ChEMBL, ZINC)
- Molecular similarity computation
- File I/O operations
- API endpoint response formats

---

## 🎯 Phase 4: End-to-End Testing (Future)

Setup Playwright for full user journeys:

```bash
npm install --save-dev @playwright/test

# Run E2E tests
npx playwright test
```

Full workflows to cover:
1. ✅ PDB search → download → view properties
2. ✅ ChEMBL bioactivity analysis → export CSV
3. ✅ ZINC upload → file browser → delete
4. ✅ Network visualization → click node → modal
5. ✅ Full-stack error scenarios

---

## 📊 Pre-Deploy Checklist

Before pushing to `main` for production:

```bash
# 1. Type checking
npm run type-check
mypy apps/python-service

# 2. Linting
npm run lint

# 3. All tests passing
npm run test:api        # 17 tests
npm run test:web        # 30 tests
npm run test:python     # TBD

# 4. Build without errors
npm run build

# 5. Optional: E2E verification
npm run test:e2e
```

---

## 🔒 Security & Quality Checks

### ✅ Implemented
- CORS validation
- Path traversal prevention
- File upload sanitization
- Dataset type validation
- API contract validation
- Error handling consistency
- Accessibility (ARIA labels, roles)

### ⏳ To Add (Python Phase)
- SQL injection prevention
- Input validation depth
- Rate limiting
- Authentication/Authorization

### ⏳ To Add (E2E Phase)
- XSS prevention
- CSRF protection
- Performance benchmarks
- Browser compatibility

---

## 💡 Testing Strategy

```
API Tests (17) ✅
    ├─ Mocks: Python backend
    └─ Speed: 8.8s

    ↓

Web Tests (30) ✅
    ├─ Mocks: API responses
    └─ Speed: 5.1s

    ↓

Python Tests (TBD)
    ├─ Mocks: External APIs (RDKit, ChEMBL)
    └─ Speed: ~30s

    ↓

E2E Tests (TBD)
    ├─ Mocks: None (everything real)
    └─ Speed: ~2-3 min

TOTAL PIPELINE: ~10-15 min
```

---

## 🚀 CI/CD Integration

### GitHub Actions Setup (Recommended)

```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      # API tests
      - run: cd apps/api && npm install && npm test
      
      # Web tests
      - run: cd apps/web && npm install && npm test
      
      # Python tests (when ready)
      - run: cd apps/python-service && pip install -r requirements.txt && pytest
```

---

## 📝 Key Files

**API**
- `apps/api/jest.config.js` - Jest configuration
- `apps/api/__tests__/endpoints.test.ts` - 10 endpoint tests
- `apps/api/__tests__/file-handling.test.ts` - 7 file operation tests

**Web**
- `apps/web/jest.config.js` - Jest + Next.js config
- `apps/web/jest.setup.js` - Testing Library setup
- `apps/web/__tests__/pages/` - 4 page tests (12 tests)
- `apps/web/__tests__/components/` - 1 component (5 tests)
- `apps/web/__tests__/hooks/` - 1 hook (3 tests)
- `apps/web/__tests__/integration/` - API contract tests (10 tests)

---

## ✨ Benefits Now

✨ Automated regression detection  
✨ Pre-deploy confidence  
✨ API contract validation  
✨ Security baseline established  
✨ Foundation for CI/CD pipeline  
✨ Documentation of expected behavior  

---

**Status**: ✅ API + Web Testing Complete | Ready for Python Phase

**Next**: `npm run test:python` setup and execution

