 # Repository Guidelines

 ## Project Structure & Module Organization
 The project structure is organized as follows:
 - **src/**: Contains the main source code.
 - **tests/**: Contains unit and integration tests.
 - **assets/**: Holds static resources like images and stylesheets.

 ## Build, Test, and Development Commands
 - `npm install`: Installs project dependencies.
 - `npm start`: Runs the application in development mode.
 - `npm test`: Executes the test suite.
 - `npm run build`: Compiles the application for production.

 ## Coding Style & Naming Conventions
 - Use **2 spaces** for indentation.
 - JavaScript files should have the `.js` extension, and React components must be named in **PascalCase** (e.g., `MyComponent.js`).
 - ESLint and Prettier are used for linting and formatting.

 ## Testing Guidelines
 - The project uses **Jest** for testing.
 - Aim for at least **80% code coverage**.
 - Test files should be named using the pattern `*.test.js`.
 - Run tests using `npm test`.

 ## Commit & Pull Request Guidelines
 - Commit messages should follow the format: `type(scope): subject` (e.g., `feat(user): add login feature`).
 - Link issues related to the pull request and provide a clear description of changes.
 - Screenshots or demo links are encouraged for UI changes.
