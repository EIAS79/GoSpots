import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { join } from "path";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  const expressInstance = app.getHttpAdapter().getInstance() as {
    set: (key: string, value: unknown) => void;
  };
  expressInstance.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: false,
      /** Dashboard (e.g. :3000) must embed images served from API (:4000). */
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  app.use(cookieParser());

  app.setGlobalPrefix("api/v1");
  app.useStaticAssets(join(process.cwd(), "uploads"), {
    prefix: "/api/v1/uploads/",
    setHeaders(res) {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    },
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableCors({
    origin: [
      config.get<string>("WEB_ORIGIN", "http://localhost:3000"),
      config.get<string>("CORS_ORIGIN", "http://localhost:3000"),
    ],
    credentials: true,
  });

  if (config.get("NODE_ENV") !== "production") {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("VenueFlow API")
      .setDescription("Gaming & billiard center management SaaS")
      .setVersion("1.0")
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("docs", app, document);
  }

  const port = +config.get("PORT", "4000");
  await app.listen(port);
}

bootstrap();
