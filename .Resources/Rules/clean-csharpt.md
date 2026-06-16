rafaelfgx/Architecture/
├─ .github/
│ └─ workflows/
│ └─ build.yaml
├─ source/
│ ├─ .vscode/
│ │ ├─ launch.json
│ │ └─ tasks.json
│ ├─ Application/
│ │ ├─ Auth/
│ │ │ ├─ AuthHandler.cs
│ │ │ ├─ AuthRequest.cs
│ │ │ ├─ AuthRequestValidator.cs
│ │ │ └─ AuthResponse.cs
│ │ ├─ Example/
│ │ │ ├─ Add/
│ │ │ │ ├─ AddExampleHandler.cs
│ │ │ │ ├─ AddExampleRequest.cs
│ │ │ │ └─ AddExampleRequestValidator.cs
│ │ │ ├─ Delete/
│ │ │ │ ├─ DeleteExampleHandler.cs
│ │ │ │ ├─ DeleteExampleRequest.cs
│ │ │ │ └─ DeleteExampleRequestValidator.cs
│ │ │ ├─ Get/
│ │ │ │ ├─ GetExampleHandler.cs
│ │ │ │ ├─ GetExampleRequest.cs
│ │ │ │ └─ GetExampleRequestValidator.cs
│ │ │ ├─ Grid/
│ │ │ │ ├─ GridExampleHandler.cs
│ │ │ │ ├─ GridExampleRequest.cs
│ │ │ │ └─ GridExampleRequestValidator.cs
│ │ │ ├─ List/
│ │ │ │ ├─ ListExampleHandler.cs
│ │ │ │ └─ ListExampleRequest.cs
│ │ │ └─ Update/
│ │ │ ├─ UpdateExampleHandler.cs
│ │ │ ├─ UpdateExampleRequest.cs
│ │ │ └─ UpdateExampleRequestValidator.cs
│ │ ├─ File/
│ │ │ ├─ Add/
│ │ │ │ ├─ AddFileHandler.cs
│ │ │ │ ├─ AddFileRequest.cs
│ │ │ │ └─ AddFileRequestValidator.cs
│ │ │ └─ Get/
│ │ │ ├─ GetFileHandler.cs
│ │ │ ├─ GetFileRequest.cs
│ │ │ └─ GetFileRequestValidator.cs
│ │ ├─ User/
│ │ │ ├─ Add/
│ │ │ │ ├─ AddUserHandler.cs
│ │ │ │ ├─ AddUserRequest.cs
│ │ │ │ └─ AddUserRequestValidator.cs
│ │ │ ├─ Delete/
│ │ │ │ ├─ DeleteUserHandler.cs
│ │ │ │ ├─ DeleteUserRequest.cs
│ │ │ │ └─ DeleteUserRequestValidator.cs
│ │ │ ├─ Get/
│ │ │ │ ├─ GetUserHandler.cs
│ │ │ │ ├─ GetUserRequest.cs
│ │ │ │ └─ GetUserRequestValidator.cs
│ │ │ ├─ Grid/
│ │ │ │ ├─ GridUserHandler.cs
│ │ │ │ ├─ GridUserRequest.cs
│ │ │ │ └─ GridUserRequestValidator.cs
│ │ │ ├─ Inactivate/
│ │ │ │ ├─ InactivateUserHandler.cs
│ │ │ │ ├─ InactivateUserRequest.cs
│ │ │ │ └─ InactivateUserRequestValidator.cs
│ │ │ ├─ List/
│ │ │ │ ├─ ListUserHandler.cs
│ │ │ │ └─ ListUserRequest.cs
│ │ │ └─ Update/
│ │ │ ├─ UpdateUserHandler.cs
│ │ │ ├─ UpdateUserRequest.cs
│ │ │ └─ UpdateUserRequestValidator.cs
│ │ ├─ Architecture.Application.csproj
│ │ └─ Validators.cs
│ ├─ Database/
│ │ ├─ Auth/
│ │ │ ├─ AuthConfiguration.cs
│ │ │ ├─ AuthRepository.cs
│ │ │ └─ IAuthRepository.cs
│ │ ├─ Context/
│ │ │ ├─ Context.cs
│ │ │ ├─ ContextFactory.cs
│ │ │ └─ ContextSeed.cs
│ │ ├─ Example/
│ │ │ ├─ ExampleConfiguration.cs
│ │ │ ├─ ExampleRepository.cs
│ │ │ └─ IExampleRepository.cs
│ │ ├─ Migrations/
│ │ │ ├─ 00000000000000_Initial.cs
│ │ │ ├─ 00000000000000_Initial.Designer.cs
│ │ │ └─ ContextModelSnapshot.cs
│ │ ├─ User/
│ │ │ ├─ IUserRepository.cs
│ │ │ ├─ UserConfiguration.cs
│ │ │ └─ UserRepository.cs
│ │ └─ Architecture.Database.csproj
│ ├─ Domain/
│ │ ├─ Architecture.Domain.csproj
│ │ ├─ Auth.cs
│ │ ├─ Example.cs
│ │ ├─ Roles.cs
│ │ ├─ Status.cs
│ │ └─ User.cs
│ ├─ Model/
│ │ ├─ Architecture.Model.csproj
│ │ ├─ ExampleModel.cs
│ │ └─ UserModel.cs
│ ├─ Web/
│ │ ├─ Controllers/
│ │ │ ├─ AuthController.cs
│ │ │ ├─ BaseController.cs
│ │ │ ├─ ExampleController.cs
│ │ │ ├─ FileController.cs
│ │ │ └─ UserController.cs
│ │ ├─ Frontend/
│ │ │ ├─ src/
│ │ │ │ ├─ app/
│ │ │ │ │ ├─ components/
│ │ │ │ │ │ ├─ button/
│ │ │ │ │ │ │ ├─ button.component.html
│ │ │ │ │ │ │ └─ button.component.ts
│ │ │ │ │ │ ├─ file/
│ │ │ │ │ │ │ ├─ file.component.html
│ │ │ │ │ │ │ ├─ file.component.ts
│ │ │ │ │ │ │ ├─ file.service.ts
│ │ │ │ │ │ │ └─ file.ts
│ │ │ │ │ │ ├─ grid/
│ │ │ │ │ │ │ ├─ filter/
│ │ │ │ │ │ │ │ ├─ filter.ts
│ │ │ │ │ │ │ │ └─ filters.ts
│ │ │ │ │ │ │ ├─ order/
│ │ │ │ │ │ │ │ ├─ order.component.html
│ │ │ │ │ │ │ │ ├─ order.component.ts
│ │ │ │ │ │ │ │ └─ order.ts
│ │ │ │ │ │ │ ├─ page/
│ │ │ │ │ │ │ │ ├─ page.component.html
│ │ │ │ │ │ │ │ ├─ page.component.ts
│ │ │ │ │ │ │ │ └─ page.ts
│ │ │ │ │ │ │ ├─ grid-parameters.ts
│ │ │ │ │ │ │ ├─ grid.service.ts
│ │ │ │ │ │ │ └─ grid.ts
│ │ │ │ │ │ ├─ input/
│ │ │ │ │ │ │ ├─ input.component.html
│ │ │ │ │ │ │ ├─ input.component.ts
│ │ │ │ │ │ │ ├─ password.input.component.ts
│ │ │ │ │ │ │ └─ text.input.component.ts
│ │ │ │ │ │ ├─ label/
│ │ │ │ │ │ │ ├─ label.component.html
│ │ │ │ │ │ │ └─ label.component.ts
│ │ │ │ │ │ ├─ select/
│ │ │ │ │ │ │ ├─ comment.select.component.ts
│ │ │ │ │ │ │ ├─ option.ts
│ │ │ │ │ │ │ ├─ post.select.component.ts
│ │ │ │ │ │ │ ├─ select.component.html
│ │ │ │ │ │ │ ├─ select.component.ts
│ │ │ │ │ │ │ └─ user.select.component.ts
│ │ │ │ │ │ └─ component.ts
│ │ │ │ │ ├─ layouts/
│ │ │ │ │ │ ├─ footer/
│ │ │ │ │ │ │ ├─ footer.component.html
│ │ │ │ │ │ │ └─ footer.component.ts
│ │ │ │ │ │ ├─ header/
│ │ │ │ │ │ │ ├─ header.component.html
│ │ │ │ │ │ │ └─ header.component.ts
│ │ │ │ │ │ ├─ layout/
│ │ │ │ │ │ │ ├─ layout.component.html
│ │ │ │ │ │ │ └─ layout.component.ts
│ │ │ │ │ │ ├─ layout-nav/
│ │ │ │ │ │ │ ├─ layout-nav.component.html
│ │ │ │ │ │ │ └─ layout-nav.component.ts
│ │ │ │ │ │ └─ nav/
│ │ │ │ │ │ ├─ nav.component.html
│ │ │ │ │ │ └─ nav.component.ts
│ │ │ │ │ ├─ models/
│ │ │ │ │ │ ├─ auth.ts
│ │ │ │ │ │ └─ user.ts
│ │ │ │ │ ├─ pages/
│ │ │ │ │ │ ├─ auth/
│ │ │ │ │ │ │ ├─ auth.component.html
│ │ │ │ │ │ │ └─ auth.component.ts
│ │ │ │ │ │ ├─ files/
│ │ │ │ │ │ │ ├─ files.component.html
│ │ │ │ │ │ │ └─ files.component.ts
│ │ │ │ │ │ ├─ form/
│ │ │ │ │ │ │ ├─ form.component.html
│ │ │ │ │ │ │ └─ form.component.ts
│ │ │ │ │ │ ├─ home/
│ │ │ │ │ │ │ ├─ home.component.html
│ │ │ │ │ │ │ └─ home.component.ts
│ │ │ │ │ │ └─ list/
│ │ │ │ │ │ ├─ grid/
│ │ │ │ │ │ │ ├─ grid.component.html
│ │ │ │ │ │ │ └─ grid.component.ts
│ │ │ │ │ │ ├─ list.component.html
│ │ │ │ │ │ └─ list.component.ts
│ │ │ │ │ ├─ services/
│ │ │ │ │ │ ├─ auth.service.ts
│ │ │ │ │ │ ├─ modal.service.ts
│ │ │ │ │ │ └─ user.service.ts
│ │ │ │ │ ├─ settings/
│ │ │ │ │ │ ├─ settings.service.ts
│ │ │ │ │ │ └─ settings.ts
│ │ │ │ │ ├─ app.can.activate.ts
│ │ │ │ │ ├─ app.component.ts
│ │ │ │ │ ├─ app.configuration.ts
│ │ │ │ │ ├─ app.error.handler.ts
│ │ │ │ │ ├─ app.http.interceptor.ts
│ │ │ │ │ └─ app.routes.ts
│ │ │ │ ├─ assets/
│ │ │ │ │ └─ settings.json
│ │ │ │ ├─ styles/
│ │ │ │ │ └─ style.scss
│ │ │ │ ├─ favicon.ico
│ │ │ │ ├─ index.html
│ │ │ │ └─ main.ts
│ │ │ ├─ .npmrc
│ │ │ ├─ angular.json
│ │ │ ├─ package.json
│ │ │ ├─ proxy.json
│ │ │ └─ tsconfig.json
│ │ ├─ Properties/
│ │ │ └─ launchSettings.json
│ │ ├─ AppSettings.json
│ │ ├─ AppStrings.json
│ │ ├─ Architecture.Web.csproj
│ │ └─ Program.cs
│ ├─ Architecture.slnx
│ ├─ Directory.Build.props
│ ├─ Directory.Packages.props
│ └─ global.json
├─ .dockerignore
├─ .editorconfig
├─ .gitattributes
├─ .gitignore
├─ docker-compose.yaml
├─ dockerfile
├─ license.md
├─ postman.json
└─ readme.md
