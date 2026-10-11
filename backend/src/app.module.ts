import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { envValidationSchema } from "./common/config/env.validation";
import { PrismaModule } from "./common/prisma/prisma.module";
import { SecurityModule } from "./common/security/security.module";
import { AuthModule } from "./modules/auth/auth.module";
import { HealthModule } from "./modules/health/health.module";
import { UsersModule } from "./modules/users/users.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { CartsModule } from "./modules/carts/carts.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { DiscountsModule } from "./modules/discounts/discounts.module";
import { ShippingModule } from "./modules/shipping/shipping.module";
import { ReturnsModule } from "./modules/returns/returns.module";
import { WishlistModule } from "./modules/wishlist/wishlist.module";
import { CommerceSessionModule } from "./modules/commerce-session/commerce-session.module";
import { CheckoutModule } from "./modules/checkout/checkout.module";
import { AdminModule } from "./modules/admin/admin.module";
import { SupportModule } from "./modules/support/support.module";
import { NewsletterModule } from "./modules/newsletter/newsletter.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validationSchema: envValidationSchema,
    }),
    PrismaModule,
    SecurityModule,
    HealthModule,
    AuthModule,
    UsersModule,
    CatalogModule,
    InventoryModule,
    CartsModule,
    OrdersModule,
    PaymentsModule,
    DiscountsModule,
    ShippingModule,
    ReturnsModule,
    WishlistModule,
    CommerceSessionModule,
    CheckoutModule,
    AdminModule,
    NewsletterModule,
    SupportModule,
  ],
})
export class AppModule {}
