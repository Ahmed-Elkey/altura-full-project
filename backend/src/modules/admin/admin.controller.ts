import { ListDiscountsQueryDto } from './dto/list-discounts-query.dto';
import { NewsletterOfferService } from '../newsletter/newsletter-offer.service';
import { NewsletterOfferDto, NewsletterOfferPreviewDto } from '../newsletter/dto/newsletter-offer.dto';
import { NewsletterService } from '../newsletter/newsletter.service';
import { NewsletterListDto } from '../newsletter/dto/newsletter-list.dto';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { AdminService } from './admin.service';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { ListAdminCustomersQueryDto } from './dto/list-admin-customers-query.dto';
import { ListAdminOrdersQueryDto } from './dto/list-admin-orders-query.dto';
import { ListPaymentReviewQueryDto } from './dto/list-payment-review-query.dto';
import { UpdateCustomerRoleDto } from './dto/update-customer-role.dto';
import { UpdateCustomerStatusDto } from './dto/update-customer-status.dto';
import { UpdateDiscountDto } from './dto/update-discount.dto';
import { UpdateOrderNoteDto } from './dto/update-order-note.dto';
import { UpdateOrderWorkflowDto } from './dto/update-order-workflow.dto';
import { UpdateReturnStatusDto } from './dto/update-return-status.dto';

@ApiTags('admin-commerce')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService, private readonly newsletter: NewsletterService, private readonly offers?:NewsletterOfferService) {}

  @Get('newsletter/offer')
  newsletterOffer() { return this.offers!.get(); }
  @Patch('newsletter/offer')
  updateNewsletterOffer(@CurrentUser() user:AuthUser,@Body() dto:NewsletterOfferDto) { return this.offers!.update(user.id,dto.version,dto.config); }
  @Post('newsletter/offer/preview')
  previewNewsletterOffer(@Body() dto:NewsletterOfferPreviewDto) { return this.offers!.preview(dto.config); }

  @Get('newsletter')
  newsletterList(@Query() query: NewsletterListDto) { return this.newsletter.list(query); }

  @Post('newsletter/:id/retry')
  retryNewsletter(@Param('id') id: string) { return this.newsletter.retry(id); }

  @Get('dashboard')
  dashboard() {
    return this.admin.dashboard();
  }

  @Get('orders')
  orders(@Query() query: ListAdminOrdersQueryDto) {
    return this.admin.listOrders(query);
  }

  @Get('orders/:orderNumber')
  order(@Param('orderNumber') orderNumber: string) {
    return this.admin.getOrder(orderNumber);
  }

  @Patch('orders/:orderNumber/workflow')
  @Roles(UserRole.ADMIN)
  updateOrderWorkflow(
    @CurrentUser() user: AuthUser,
    @Param('orderNumber') orderNumber: string,
    @Body() dto: UpdateOrderWorkflowDto,
  ) {
    return this.admin.updateOrderWorkflow(user.id, orderNumber, dto);
  }

  @Post('orders/:orderNumber/collect-cash')
  @Roles(UserRole.ADMIN)
  collectCash(@CurrentUser() user: AuthUser, @Param('orderNumber') orderNumber: string, @Body() body: unknown) {
    if (body !== undefined && body !== null && (typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length)) {
      throw new BadRequestException('Cash collection does not accept payment overrides');
    }
    return this.admin.collectCash(user.id, orderNumber);
  }

  @Patch('orders/:orderNumber/note')
  updateOrderNote(
    @CurrentUser() user: AuthUser,
    @Param('orderNumber') orderNumber: string,
    @Body() dto: UpdateOrderNoteDto,
  ) {
    return this.admin.updateOrderNote(user.id, orderNumber, dto);
  }

  @Get('customers')
  customers(@Query() query: ListAdminCustomersQueryDto) {
    return this.admin.listCustomers(query);
  }

  @Get('customers/:userId')
  customer(@Param('userId') userId: string) {
    return this.admin.getCustomer(userId);
  }

  @Patch('customers/:userId/status')
  updateCustomerStatus(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Body() dto: UpdateCustomerStatusDto,
  ) {
    return this.admin.updateCustomerStatus(user.id, userId, dto);
  }

  @Patch('customers/:userId/role')
  @Roles(UserRole.ADMIN)
  updateCustomerRole(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Body() dto: UpdateCustomerRoleDto,
  ) {
    return this.admin.updateCustomerRole(user.id, userId, dto);
  }

  @Get('discounts')
  discounts(@Query() query:ListDiscountsQueryDto) {
    return this.admin.listDiscounts(query);
  }

  @Post('discounts')
  createDiscount(@CurrentUser() user: AuthUser, @Body() dto: CreateDiscountDto) {
    return this.admin.createDiscount(user.id, dto);
  }

  @Patch('discounts/:discountId')
  updateDiscount(
    @CurrentUser() user: AuthUser,
    @Param('discountId') discountId: string,
    @Body() dto: UpdateDiscountDto,
  ) {
    return this.admin.updateDiscount(user.id, discountId, dto);
  }

  @Get('payments/review')
  paymentReview(@Query() query: ListPaymentReviewQueryDto) {
    return this.admin.listPaymentReview(query);
  }

  @Get('returns')
  returns() {
    return this.admin.listReturns();
  }

  @Patch('returns/:returnId')
  updateReturnStatus(
    @CurrentUser() user: AuthUser,
    @Param('returnId') returnId: string,
    @Body() dto: UpdateReturnStatusDto,
  ) {
    return this.admin.updateReturnStatus(user.id, returnId, dto);
  }

  @Get('shipping')
  shipping() {
    return this.admin.listShipping();
  }

  @Get('audit')
  audit(@Query('limit') limit?: string) {
    const parsed = Number.parseInt(limit ?? '50', 10);
    return this.admin.listAudit(Number.isFinite(parsed) ? parsed : 50);
  }
}
