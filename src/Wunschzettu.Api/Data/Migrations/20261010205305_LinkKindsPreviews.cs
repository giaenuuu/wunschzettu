using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wunschzettu.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class LinkKindsPreviews : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "Label",
                table: "WishLink",
                type: "TEXT",
                maxLength: 100,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "TEXT",
                oldMaxLength: 100);

            migrationBuilder.AddColumn<string>(
                name: "Kind",
                table: "WishLink",
                type: "TEXT",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTime>(
                name: "PreviewFetchedAt",
                table: "WishLink",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PreviewImageKey",
                table: "WishLink",
                type: "TEXT",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PreviewSiteName",
                table: "WishLink",
                type: "TEXT",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PreviewTitle",
                table: "WishLink",
                type: "TEXT",
                maxLength: 300,
                nullable: true);

            // Links with an address were shops on the web, the others named a store.
            migrationBuilder.Sql("UPDATE WishLink SET Kind = CASE WHEN Url IS NULL THEN 'Store' ELSE 'Online' END;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Kind",
                table: "WishLink");

            migrationBuilder.DropColumn(
                name: "PreviewFetchedAt",
                table: "WishLink");

            migrationBuilder.DropColumn(
                name: "PreviewImageKey",
                table: "WishLink");

            migrationBuilder.DropColumn(
                name: "PreviewSiteName",
                table: "WishLink");

            migrationBuilder.DropColumn(
                name: "PreviewTitle",
                table: "WishLink");

            migrationBuilder.Sql("UPDATE WishLink SET Label = COALESCE(Label, Url, '') WHERE Label IS NULL;");

            migrationBuilder.AlterColumn<string>(
                name: "Label",
                table: "WishLink",
                type: "TEXT",
                maxLength: 100,
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "TEXT",
                oldMaxLength: 100,
                oldNullable: true);
        }
    }
}
